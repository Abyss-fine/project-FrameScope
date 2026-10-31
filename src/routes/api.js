import { Router } from 'express';
import { ApiError, queryInteger, queryText } from '../services/validation.js';
import { getCatalog, findGame, getHardware } from '../repositories/catalog.js';
import { availability } from '../repositories/benchmarks.js';
import { estimate } from '../services/estimate.js';
import { graphicsSettings } from '../services/graphics-settings.js';

export function apiRoutes(db) {
  const router = Router();
  router.get('/health', (_request, response) => {
    db.prepare('SELECT 1').get();
    response.json({ status: 'ok', database: 'sqlite', version: '0.1.0' });
  });
  router.get('/games', (request, response) => {
    const q = request.query;
    if (Object.keys(q).some(key => !['search','genre','featured','limit','offset'].includes(key))) throw new ApiError(400, 'INVALID_QUERY', 'Неизвестные параметры каталога.');
    if (q.featured !== undefined && !['true','false'].includes(q.featured)) throw new ApiError(400, 'INVALID_QUERY', 'featured: true или false.');
    response.json(getCatalog(db, { search: queryText(q.search, 'search'), genre: queryText(q.genre, 'genre'),
      featured: q.featured === 'true', limit: queryInteger(q.limit, 'limit', 24), offset: queryInteger(q.offset, 'offset', 0, 1000000) }));
  });
  router.get('/games/:id', (request, response) => {
    const game = findGame(db, request.params.id);
    if (!game) throw new ApiError(404, 'GAME_NOT_FOUND', 'Игра не найдена.');
    response.json(game);
  });
  router.get('/games/:id/settings', (request,response) => {
    const game=findGame(db,request.params.id);
    if(!game) throw new ApiError(404,'GAME_NOT_FOUND','Игра не найдена.');
    if(Object.keys(request.query).some(key=>key!=='gpuId')) throw new ApiError(400,'INVALID_QUERY','Неизвестные параметры настроек.');
    response.json(graphicsSettings(db,game.id,queryInteger(request.query.gpuId,'gpuId')));
  });
  for(const kind of ['cpus','gpus']) router.get('/hardware/'+kind,(request,response)=>{
    const q=request.query;
    if(Object.keys(q).some(key=>!['search','limit','offset'].includes(key)))throw new ApiError(400,'INVALID_QUERY','Неизвестные параметры поиска оборудования.');
    const items=getHardware(db,kind,{search:queryText(q.search,'search'),limit:queryInteger(q.limit,'limit',2000,2000),offset:queryInteger(q.offset,'offset',0,1000000)});
    response.json({items});
  });
  router.get('/benchmarks/availability', (request, response) => {
    const q = request.query;
    if (Object.keys(q).some(key => !['gameId','gpuId','limit','offset'].includes(key))) throw new ApiError(400, 'INVALID_QUERY', 'Неизвестные параметры availability.');
    response.json(availability(db, { gameId: queryInteger(q.gameId, 'gameId'), gpuId: queryInteger(q.gpuId, 'gpuId'),
      limit: queryInteger(q.limit, 'limit', 100, 1000), offset: queryInteger(q.offset, 'offset', 0, 1000000) }));
  });
  router.post('/benchmarks/estimate', (request, response) => {
    if (!request.is('application/json')) throw new ApiError(415, 'JSON_REQUIRED', 'Используй Content-Type: application/json.');
    const result = estimate(db, request.body);
    response.status(result.status).json(result.body);
  });
  router.use((_request, _response, next) => next(new ApiError(404, 'API_NOT_FOUND', 'Маршрут API не найден.')));
  return router;
}
