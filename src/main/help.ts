import { ipcMain, net } from 'electron'
import { HELP_API_ORIGIN, HELP_TIMEOUT_MS, helpQuestion, helpFeedbackBody, readHelpAnswer, readHelpSuggestions } from '../shared/help-api'

async function request(path: string, body?: { id: number; helpful: boolean }): Promise<Response> {
  const response = await net.fetch(`${HELP_API_ORIGIN}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'omit',
    redirect: 'error',
    signal: AbortSignal.timeout(HELP_TIMEOUT_MS)
  })
  if (!response.ok) throw new Error('Could not reach BinaryLane help.')
  return response
}

export function registerHelpHandlers(): void {
  // No token, no profile id, no server ids, no History, no ticket text.
  // Only the search-box text is accepted; never read the vault or server data here.
  ipcMain.handle('help:ask', async (_event, question: string) =>
    readHelpAnswer(await (await request(`/api/help?q=${encodeURIComponent(helpQuestion(question))}`)).json()))
  ipcMain.handle('help:suggest', async (_event, prefix: string) =>
    readHelpSuggestions(await (await request(`/api/help/suggest?q=${encodeURIComponent(helpQuestion(prefix))}`)).json()))
  ipcMain.handle('help:feedback', async (_event, id: string, helpful: boolean) => {
    await request('/api/help/feedback', helpFeedbackBody(id, helpful))
  })
}
