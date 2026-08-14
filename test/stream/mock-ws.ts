/**
 * A vitest-compatible WebSocket mock server.
 *
 * Provides a fake WebSocket constructor that captures connected clients so
 * tests can push frames to them, and records everything the client sends so
 * tests can assert on the wire protocol (join, leave, heartbeat) directly.
 */

type EventHandler = ((event: Event) => void) | null
type MessageHandler = ((event: MessageEvent) => void) | null

export class FakeWebSocket extends EventTarget {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readonly CONNECTING = 0
  readonly OPEN = 1
  readonly CLOSING = 2
  readonly CLOSED = 3

  readyState: number = FakeWebSocket.CONNECTING
  url: string
  protocol = ""
  extensions = ""
  bufferedAmount = 0
  binaryType: BinaryType = "blob"

  /** Every frame this client has sent, in order. */
  readonly sent: string[] = []

  onopen: EventHandler = null
  onclose: EventHandler = null
  onerror: EventHandler = null
  onmessage: MessageHandler = null

  /** When set, this socket closes instead of opening, as a refused connection. */
  _failToOpen = false

  constructor(url: string | URL, _protocols?: string | string[]) {
    super()
    this.url = typeof url === "string" ? url : url.toString()

    // Settle on a microtask so the handlers assigned right after construction
    // are in place before `onopen` or `onclose` fires.
    queueMicrotask(() => {
      if (this.readyState !== FakeWebSocket.CONNECTING) {
        return
      }
      if (this._failToOpen) {
        this.close(1006, "connection refused")
        return
      }
      this.readyState = FakeWebSocket.OPEN
      const event = new Event("open")
      this.onopen?.(event)
      this.dispatchEvent(event)
    })
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    if (typeof data === "string") {
      this.sent.push(data)
    }
  }

  close(code?: number, reason?: string): void {
    if (this.readyState === FakeWebSocket.CLOSED) {
      return
    }
    this.readyState = FakeWebSocket.CLOSED
    const event = new CloseEvent("close", { code, reason })
    this.onclose?.(event)
    this.dispatchEvent(event)
  }

  /** Simulate receiving a frame from the server. */
  _receiveMessage(data: string) {
    const event = new MessageEvent("message", { data })
    this.onmessage?.(event)
    this.dispatchEvent(event)
  }

  /** Simulate a transport-level error. */
  _receiveError() {
    const event = new Event("error")
    this.onerror?.(event)
    this.dispatchEvent(event)
  }
}

export class MockWS {
  private readonly originalWebSocket: typeof WebSocket
  private readonly clientList: FakeWebSocket[] = []
  /** Number of upcoming connections that will be refused. */
  pendingFailures = 0

  constructor(url: string) {
    this.originalWebSocket = globalThis.WebSocket

    const serverUrl = url
    const clientList = this.clientList
    const server = this

    globalThis.WebSocket = class extends FakeWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols)
        const urlStr = typeof url === "string" ? url : url.toString()
        if (urlStr.startsWith(serverUrl)) {
          if (server.pendingFailures > 0) {
            server.pendingFailures -= 1
            this._failToOpen = true
          }
          clientList.push(this)
        }
      }
    } as unknown as typeof WebSocket

    Object.defineProperty(globalThis.WebSocket, "CONNECTING", { value: 0 })
    Object.defineProperty(globalThis.WebSocket, "OPEN", { value: 1 })
    Object.defineProperty(globalThis.WebSocket, "CLOSING", { value: 2 })
    Object.defineProperty(globalThis.WebSocket, "CLOSED", { value: 3 })
  }

  /** Every client that has connected, including ones replaced by reconnects. */
  get clients(): FakeWebSocket[] {
    return this.clientList
  }

  /** The most recently connected client. */
  get client(): FakeWebSocket | undefined {
    return this.clientList[this.clientList.length - 1]
  }

  /** How many times a client has connected. Reconnects increment this. */
  get connectionCount(): number {
    return this.clientList.length
  }

  /** Raw frames sent by the current client. */
  get sent(): string[] {
    return this.client?.sent ?? []
  }

  /** Frames sent by the current client, parsed into Phoenix tuples. */
  sentFrames(): [string | null, string | null, string, string, unknown][] {
    return this.sent.map(
      frame =>
        JSON.parse(frame) as [
          string | null,
          string | null,
          string,
          string,
          unknown,
        ],
    )
  }

  /** Frames sent by the current client matching an event name. */
  framesOfType(
    event: string,
  ): [string | null, string | null, string, string, unknown][] {
    return this.sentFrames().filter(([, , , sentEvent]) => sentEvent === event)
  }

  /** Push a frame to every connected client. */
  send(data: string) {
    for (const client of this.clientList) {
      if (client.readyState !== FakeWebSocket.CLOSED) {
        client._receiveMessage(data)
      }
    }
  }

  /**
   * Drop the current connection as a server or network failure would, without
   * unpatching the global. The client should reconnect and register anew.
   */
  dropConnection(code = 1006) {
    this.client?.close(code, "connection lost")
  }

  /** Refuse the next `count` connection attempts, as an outage would. */
  refuseConnections(count: number) {
    this.pendingFailures = count
  }

  /** Close all connections and restore the original WebSocket. */
  close() {
    for (const client of this.clientList) {
      client.close()
    }
    this.clientList.length = 0
    globalThis.WebSocket = this.originalWebSocket
  }
}
