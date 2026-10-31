import express from 'express';
import { publicDirectory } from './config.js';
import { apiRoutes } from './routes/api.js';

export function createApp(db) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_request, response, next) => {
    response.set('X-Content-Type-Options', 'nosniff');
    response.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });
  app.use('/api', express.json({ limit: '16kb', strict: true }), apiRoutes(db));
  // Публикуем только public: база, .env, исходники сервера и node_modules недоступны.
  app.use(express.static(publicDirectory, { dotfiles: 'deny' }));
  app.use((_request, response) => response.status(404).type('text').send('Страница не найдена.'));
  app.use((error, _request, response, _next) => {
    const status = error.status === 413 ? 413 : error.type === 'entity.parse.failed' ? 400 : error.status || 500;
    if (status >= 500) console.error('API error:', error);
    response.status(status).json({
      code: status >= 500 ? 'INTERNAL_ERROR' : status === 413 ? 'BODY_TOO_LARGE' : error.type === 'entity.parse.failed' ? 'INVALID_JSON' : error.code || 'REQUEST_ERROR',
      message: status >= 500 ? 'Внутренняя ошибка сервера.' : status === 413 ? 'Размер JSON превышает 16 KiB.' : error.type === 'entity.parse.failed' ? 'Некорректный JSON.' : error.message
    });
  });
  return app;
}
