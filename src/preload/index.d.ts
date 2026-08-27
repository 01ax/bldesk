import { IpcApi } from '../shared/ipc-types'

declare global {
  interface Window {
    bldeskApi: IpcApi
  }
}
