package expo.modules.pdfrenderer

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream

/**
 * Expo Native Module for Android PDF Page Rendering using android.graphics.pdf.PdfRenderer.
 * Renders individual pages of a PDF into bitmap images in cacheDir for OCR processing.
 */
class ExpoPdfRendererModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoPdfRenderer")

    Constants(
      "isSupported" to true
    )

    AsyncFunction("getPageCount") { pdfUriString: String ->
      val context = appContext.reactContext ?: throw Exception("React context unavailable")
      val pfd = if (pdfUriString.startsWith("content://")) {
        context.contentResolver.openFileDescriptor(Uri.parse(pdfUriString), "r")
          ?: throw Exception("Cannot open content descriptor: $pdfUriString")
      } else {
        val cleanPath = Uri.parse(pdfUriString).path ?: pdfUriString.removePrefix("file://")
        val file = File(cleanPath)
        if (!file.exists()) {
          throw Exception("PDF file not found at: $cleanPath")
        }
        ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
      }

      val renderer = PdfRenderer(pfd)
      try {
        renderer.pageCount
      } finally {
        renderer.close()
        pfd.close()
      }
    }

    AsyncFunction("renderPageToImage") { pdfUriString: String, pageNumber: Int ->
      val context = appContext.reactContext ?: throw Exception("React context unavailable")
      val pfd = if (pdfUriString.startsWith("content://")) {
        context.contentResolver.openFileDescriptor(Uri.parse(pdfUriString), "r")
          ?: throw Exception("Cannot open content descriptor: $pdfUriString")
      } else {
        val cleanPath = Uri.parse(pdfUriString).path ?: pdfUriString.removePrefix("file://")
        val file = File(cleanPath)
        if (!file.exists()) {
          throw Exception("PDF file not found at: $cleanPath")
        }
        ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
      }
      val renderer = PdfRenderer(pfd)
      try {
        val pageIndex = pageNumber - 1
        if (pageIndex < 0 || pageIndex >= renderer.pageCount) {
          throw Exception("Requested page $pageNumber is out of range (1..${renderer.pageCount})")
        }

        val page = renderer.openPage(pageIndex)
        // 2x scaling produces crisp rendering for OCR line recognition
        val width = (page.width * 2).coerceAtLeast(1)
        val height = (page.height * 2).coerceAtLeast(1)
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        bitmap.eraseColor(Color.WHITE)
        page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
        page.close()

        val outFile = File(context.cacheDir, "pdf_page_${System.currentTimeMillis()}_${pageNumber}.png")
        FileOutputStream(outFile).use { outStream ->
          bitmap.compress(Bitmap.CompressFormat.PNG, 100, outStream)
        }
        bitmap.recycle()

        mapOf(
          "imageUri" to "file://" + outFile.absolutePath,
          "filePath" to outFile.absolutePath,
          "width" to width,
          "height" to height,
          "pageCount" to renderer.pageCount
        )
      } finally {
        renderer.close()
        pfd.close()
      }
    }

    AsyncFunction("cleanupFile") { filePathString: String ->
      try {
        val cleanPath = filePathString.removePrefix("file://").removePrefix("file:")
        val file = File(cleanPath)
        if (file.exists()) {
          file.delete()
        }
        true
      } catch (e: Exception) {
        false
      }
    }

    AsyncFunction("sanitizeTemporaryFiles") { olderThanMs: Long ->
      var deletedCount = 0
      try {
        val context = appContext.reactContext ?: return@AsyncFunction 0
        val now = System.currentTimeMillis()
        val cutoffTime = if (olderThanMs > 0) now - olderThanMs else now

        // 1. Scan cache/DocumentPicker for Bjet imported PDFs
        val docPickerDir = File(context.cacheDir, "DocumentPicker")
        if (docPickerDir.exists() && docPickerDir.isDirectory) {
          docPickerDir.listFiles()?.forEach { file ->
            val name = file.name.lowercase()
            if (name.endsWith(".pdf") && file.lastModified() <= cutoffTime) {
              if (file.delete()) {
                deletedCount++
              }
            }
          }
        }

        // 2. Scan cache for rendered PDF pages (pdf_page_*.png)
        context.cacheDir.listFiles()?.forEach { file ->
          val name = file.name
          if (name.startsWith("pdf_page_") && name.endsWith(".png") && file.lastModified() <= cutoffTime) {
            if (file.delete()) {
              deletedCount++
            }
          }
        }
      } catch (e: Exception) {
        // Defensive: never throw or crash
      }
      deletedCount
    }
  }
}
