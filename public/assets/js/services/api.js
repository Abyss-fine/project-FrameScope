export class ApiRequestError extends Error {
  constructor(message, status, data) { super(message); Object.assign(this, {status,data}); }
}
export async function apiRequest(path, options = {}) {
  let response;
  try {
    response = await fetch('/api' + path, {
      ...options, headers: {'Content-Type':'application/json',...options.headers},
      signal: options.signal ?? AbortSignal.timeout(20000)
    });
  } catch(error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiRequestError('Сервер недоступен или не успел ответить. Запусти npm run dev и открой http://localhost:3000.',0);
  }
  let data;
  try { data = await response.json(); }
  catch { throw new ApiRequestError('Не получен ответ API. Открой сайт через Express (npm run dev), а не Live Server.',response.status); }
  if (!response.ok) throw new ApiRequestError(data.message || 'Ошибка запроса.',response.status,data);
  return data;
}
export const loadGames = (params = {}, signal) => apiRequest('/games?' + new URLSearchParams(params),{signal});
export const loadGame = id => apiRequest('/games/' + encodeURIComponent(id));
