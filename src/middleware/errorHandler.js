// =============================================
// Qayed - Error Handler Middleware
// =============================================

function errorHandler(err, req, res, next) {
  console.error('❌ Error:', err.message);
  console.error(err.stack);

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      error: 'صيغة البيانات غير صحيحة'
    });
  }

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      error: 'حجم الملف أكبر من المسموح (5MB كحد أقصى)'
    });
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      success: false,
      error: 'نوع الملف غير مدعوم'
    });
  }

  res.status(err.statusCode || 500).json({
    success: false,
    error: err.message || 'حدث خطأ في الخادم',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

function notFound(req, res) {
  res.status(404).json({
    success: false,
    error: `المسار ${req.originalUrl} غير موجود`
  });
}

module.exports = { errorHandler, notFound };
