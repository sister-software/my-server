export type Handler = (request: Request) => Promise<Response>

export interface HandlerDeclaration {
  pattern: RegExp
  handler: Handler
}

export const defaultHandler = (request: Request) => fetch(request)
