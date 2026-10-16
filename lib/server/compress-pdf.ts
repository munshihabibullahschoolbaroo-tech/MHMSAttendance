import { PDFDocument, PDFName, PDFStream, PDFRawStream } from "pdf-lib";
import sharp from "sharp";
import zlib from "zlib";

/**
 * Compresses a PDF buffer by:
 * 1. Scanning and re-compressing heavy embedded raster images (DCTDecode / FlateDecode)
 *    Downscaling large 300-600 DPI scans to max 1280px and re-encoding at Q65 mozjpeg.
 * 2. Compacting PDF object structure and stream dictionaries using object streams (useObjectStreams: true).
 * 
 * Returns the compressed buffer if smaller, or the original buffer if compression was not beneficial.
 */
export async function compressPdfBuffer(inputBuffer: Buffer): Promise<Buffer> {
  if (!inputBuffer || inputBuffer.length < 50000) {
    // Under 50KB PDFs are already lightweight, no need for heavy compression
    return inputBuffer;
  }

  try {
    const pdfDoc = await PDFDocument.load(inputBuffer, {
      ignoreEncryption: true,
      parseSpeed: 1,
    });

    const indirectObjects = pdfDoc.context.enumerateIndirectObjects();
    let compressedImagesCount = 0;

    for (const [, obj] of indirectObjects) {
      if (!(obj instanceof PDFRawStream || obj instanceof PDFStream)) continue;

      const dict = obj.dict;
      if (!dict) continue;

      const subtype = dict.get(PDFName.of("Subtype"));
      if (subtype?.toString() !== "/Image") continue;

      try {
        const rawBytes = obj.getContents();
        if (!rawBytes || rawBytes.length < 10000) continue; // Skip tiny icons/signatures under 10KB

        const filter = dict.get(PDFName.of("Filter"))?.toString();
        const widthObj = dict.get(PDFName.of("Width")) as any;
        const heightObj = dict.get(PDFName.of("Height")) as any;
        const width = typeof widthObj?.asNumber === "function" ? widthObj.asNumber() : Number(widthObj);
        const height = typeof heightObj?.asNumber === "function" ? heightObj.asNumber() : Number(heightObj);
        const colorSpace = dict.get(PDFName.of("ColorSpace"))?.toString();

        let imageBuffer: Buffer | null = null;

        if (filter === "/DCTDecode") {
          // Standard JPEG stream
          imageBuffer = Buffer.from(rawBytes);
        } else if (filter === "/FlateDecode") {
          try {
            const inflated = zlib.inflateSync(Buffer.from(rawBytes));
            const channels = colorSpace === "/DeviceGray" ? 1 : 3;
            if (
              width &&
              height &&
              inflated.length >= width * height * channels &&
              inflated.length <= width * height * channels + 1024
            ) {
              imageBuffer = await sharp(inflated.subarray(0, width * height * channels), {
                raw: { width, height, channels },
              })
                .png()
                .toBuffer();
            } else {
              imageBuffer = await sharp(inflated).toBuffer().catch(() => null);
            }
          } catch {
            imageBuffer = await sharp(Buffer.from(rawBytes)).toBuffer().catch(() => null);
          }
        } else {
          imageBuffer = await sharp(Buffer.from(rawBytes)).toBuffer().catch(() => null);
        }

        if (!imageBuffer) continue;

        const meta = await sharp(imageBuffer).metadata().catch(() => null);
        if (!meta || !meta.width || !meta.height) continue;

        // Downscale oversized scans/photos (300-600 DPI document scans can be 3000x4000px)
        const maxDim = 1280;
        let resizeOptions: { width?: number; height?: number; fit: "inside"; withoutEnlargement: boolean } | undefined;
        if (meta.width > maxDim || meta.height > maxDim) {
          resizeOptions = {
            width: meta.width >= meta.height ? maxDim : undefined,
            height: meta.height > meta.width ? maxDim : undefined,
            fit: "inside",
            withoutEnlargement: true,
          };
        }

        let pipeline = sharp(imageBuffer).rotate();
        if (resizeOptions) {
          pipeline = pipeline.resize(resizeOptions);
        }

        const compressed = await pipeline
          .jpeg({ quality: 65, mozjpeg: true })
          .toBuffer();

        // Only replace if compressed is meaningfully smaller
        if (compressed.length < rawBytes.length * 0.9) {
          const newMeta = await sharp(compressed).metadata();

          (obj as any).contents = compressed;
          dict.set(PDFName.of("Filter"), PDFName.of("DCTDecode"));
          dict.set(PDFName.of("ColorSpace"), PDFName.of("DeviceRGB"));
          dict.set(PDFName.of("BitsPerComponent"), pdfDoc.context.obj(8));
          dict.set(PDFName.of("Width"), pdfDoc.context.obj(newMeta.width || width || meta.width));
          dict.set(PDFName.of("Height"), pdfDoc.context.obj(newMeta.height || height || meta.height));
          dict.set(PDFName.of("Length"), pdfDoc.context.obj(compressed.length));
          dict.delete(PDFName.of("DecodeParms"));
          dict.delete(PDFName.of("SMask"));

          compressedImagesCount++;
        }
      } catch {
        // Continue to other objects
      }
    }

    const compressedPdfBytes = await pdfDoc.save({ useObjectStreams: true });
    const resultBuffer = Buffer.from(compressedPdfBytes);

    if (resultBuffer.length < inputBuffer.length) {
      const savedPercent = Math.round((1 - resultBuffer.length / inputBuffer.length) * 100);
      console.log(
        `[compressPdfBuffer] Optimized PDF: ${(inputBuffer.length / 1024).toFixed(1)} KB -> ${(
          resultBuffer.length / 1024
        ).toFixed(1)} KB (${savedPercent}% saved, ${compressedImagesCount} images compressed)`
      );
      return resultBuffer as any;
    }

    return inputBuffer as any;
  } catch (err) {
    console.warn("[compressPdfBuffer] Failed to compress PDF, keeping original:", err);
    return inputBuffer as any;
  }
}
