import { afterEach, beforeAll, describe, expect, test } from "vitest"
import {
  type BaseStreamMessage,
  EventType,
  LogLevel,
  OpenSeaStreamClient,
} from "../../src/stream"

/**
 * Live tests against `wss://stream-api.opensea.io/socket`.
 *
 * These exercise the inlined Phoenix Channels transport against the real
 * server: the handshake, the join acknowledgement, the heartbeat, and the
 * leave. Unit tests run against a mock, so this is the only place the actual
 * wire contract is verified.
 *
 * Each test uses its own client. Sharing one connection across tests couples
 * them: leaving a topic in one test races the next test's re-subscribe to the
 * same topic, so a late server frame for the old channel lands mid-test.
 *
 * Requires OPENSEA_API_KEY. Skipped without one.
 */

const API_KEY = process.env.OPENSEA_API_KEY
const ALL_COLLECTIONS = "*"

/** Event types with enough volume that one arrives within seconds. */
const HIGH_VOLUME_EVENTS = [
  EventType.ITEM_LISTED,
  EventType.ITEM_SOLD,
  EventType.ITEM_RECEIVED_BID,
  EventType.ITEM_CANCELLED,
  EventType.ITEM_TRANSFERRED,
  EventType.ORDER_INVALIDATE,
]

let client: OpenSeaStreamClient | undefined

const makeClient = (overrides: Record<string, unknown> = {}) => {
  client = new OpenSeaStreamClient({
    apiKey: API_KEY as string,
    logLevel: LogLevel.ERROR,
    ...overrides,
  })
  return client
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** Resolve with the first event to arrive, or reject after `timeoutMs`. */
const waitForEvent = (
  streamClient: OpenSeaStreamClient,
  timeoutMs = 20_000,
): Promise<BaseStreamMessage<unknown>> =>
  new Promise((resolve, reject) => {
    let unsubscribe: (() => void) | undefined
    const timer = setTimeout(() => {
      unsubscribe?.()
      reject(new Error(`No event received within ${timeoutMs}ms`))
    }, timeoutMs)
    unsubscribe = streamClient.onEvents(
      ALL_COLLECTIONS,
      HIGH_VOLUME_EVENTS,
      event => {
        clearTimeout(timer)
        unsubscribe?.()
        resolve(event)
      },
    )
  })

describe.skipIf(!API_KEY)("Stream API (live)", () => {
  /**
   * Fail loudly when the socket cannot be reached at all.
   *
   * Several assertions below are satisfied by an absence of events, so a
   * blocked network would let them pass while proving nothing. The most
   * common local cause is an HTTP(S)_PROXY that only tunnels registry
   * traffic, which npm and pnpm wrappers set.
   */
  beforeAll(async () => {
    const probe = new OpenSeaStreamClient({
      apiKey: API_KEY as string,
      logLevel: LogLevel.ERROR,
    })
    try {
      await waitForEvent(probe, 20_000)
    } catch {
      const proxy =
        process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY ?? "(none set)"
      throw new Error(
        "Could not reach wss://stream-api.opensea.io/socket, so the live " +
          "stream tests cannot verify anything. Check network access and " +
          `HTTP(S)_PROXY, currently ${proxy}. If the proxy only allows the ` +
          "npm registry, run vitest directly instead of through pnpm.",
      )
    } finally {
      probe.disconnect()
    }
  }, 25_000)

  afterEach(() => {
    client?.disconnect()
    client = undefined
  })

  test("connects, subscribes, and receives a well-formed event", async () => {
    const event = await waitForEvent(makeClient())

    expect(typeof event.event_type).toBe("string")
    expect(HIGH_VOLUME_EVENTS).toContain(event.event_type as EventType)
    expect(typeof event.sent_at).toBe("string")
    expect(event.payload).toBeTypeOf("object")
    expect(event.payload).not.toBeNull()
  })

  test("keeps receiving events across several heartbeat intervals", async () => {
    // A 5s heartbeat means the run below spans multiple beats. If the server
    // fails to answer, or we mis-frame the heartbeat, the transport tears the
    // connection down and the second batch never arrives. This needs its own
    // client because the interval is fixed at construction.
    const streamClient = makeClient({
      connectOptions: { heartbeatIntervalMs: 5_000 },
    })

    let received = 0
    streamClient.onEvents(ALL_COLLECTIONS, HIGH_VOLUME_EVENTS, () => {
      received += 1
    })

    await wait(7_000)
    const afterFirstWindow = received
    expect(afterFirstWindow).toBeGreaterThan(0)

    await wait(7_000)
    expect(received).toBeGreaterThan(afterFirstWindow)
  }, 30_000)

  test("stops delivering after unsubscribe", async () => {
    let received = 0
    const unsubscribe = makeClient().onEvents(
      ALL_COLLECTIONS,
      HIGH_VOLUME_EVENTS,
      () => {
        received += 1
      },
    )

    // Wait for traffic to prove the subscription is live before dropping it.
    await wait(4_000)
    expect(received).toBeGreaterThan(0)

    unsubscribe()
    // Allow the leave to round-trip before sampling again.
    await wait(1_000)
    const afterUnsubscribe = received

    await wait(4_000)
    expect(received).toBe(afterUnsubscribe)
  }, 30_000)

  test("delivers only the subscribed collection's events", async () => {
    const slug = "boredapeyachtclub"

    const events: BaseStreamMessage<{ collection?: { slug?: string } }>[] = []
    const unsubscribe = makeClient().onEvents(
      slug,
      HIGH_VOLUME_EVENTS,
      event => {
        events.push(
          event as BaseStreamMessage<{ collection?: { slug?: string } }>,
        )
      },
    )

    try {
      await wait(8_000)
      // A quiet collection is a valid outcome; what must never happen is an
      // event for a different collection arriving on this subscription.
      for (const event of events) {
        expect(event.payload?.collection?.slug).toBe(slug)
      }
    } finally {
      unsubscribe()
    }
  }, 30_000)

  test("delivers no events for an invalid API key", async () => {
    const errors: unknown[] = []
    let received = 0
    const streamClient = makeClient({
      apiKey: "definitely-not-a-valid-api-key",
      onError: (error: unknown) => errors.push(error),
      // A rejected credential is not transient, so the client retries forever
      // by design. Left unbounded that is a reconnect storm for the rest of
      // the file, which keeps the suite alive long after this test finishes.
      connectOptions: { reconnectAfterMs: () => 60_000 },
    })

    streamClient.onEvents(ALL_COLLECTIONS, HIGH_VOLUME_EVENTS, () => {
      received += 1
    })
    await wait(8_000)

    // The property that matters is that a bad credential never streams data.
    // The `beforeAll` probe proves the endpoint is reachable, so zero events
    // here is a real rejection rather than a dead network.
    expect(received).toBe(0)
    // The server refuses the handshake rather than accepting and going quiet.
    expect(errors.length).toBeGreaterThan(0)
  }, 30_000)
})
