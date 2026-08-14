import type {
  BaseStreamMessage,
  EventType,
  OpenSeaStreamClient,
} from "../../src/stream"
import type { PhoenixChannelsTransport } from "../../src/stream/transport/phoenix"

/**
 * Reach into the client's transport. The transport is intentionally not part
 * of the public API, so tests access it deliberately rather than through an
 * exported accessor.
 */
export const getTransport = (
  client: OpenSeaStreamClient,
): PhoenixChannelsTransport => {
  // @ts-expect-error private access
  return client.transport
}

/** Topics the client currently holds a subscription for. */
export const getTopics = (client: OpenSeaStreamClient): string[] => {
  // @ts-expect-error private access
  return Array.from(getTransport(client).subscriptions.keys())
}

type ChannelParams<Payload = unknown> = {
  join_ref?: string | null
  ref?: string | null
  topic: string
  event: string
  payload: BaseStreamMessage<Payload> | unknown
}

export const encode = ({
  join_ref = null,
  ref = null,
  topic,
  event,
  payload,
}: ChannelParams) => {
  return JSON.stringify([join_ref, ref, topic, event, payload])
}

/** A `phx_reply` frame acknowledging the request with the given ref. */
export const encodeReply = ({
  ref,
  topic,
  status = "ok",
  response = {},
}: {
  ref: string
  topic: string
  status?: string
  response?: unknown
}) => {
  return JSON.stringify([ref, ref, topic, "phx_reply", { status, response }])
}

export const mockEvent = <Payload = unknown>(
  eventType: EventType,
  payload: Payload,
  overrides?: Partial<BaseStreamMessage<Payload>>,
): BaseStreamMessage<Payload> => {
  return {
    event_type: eventType,
    version: 1713300000000,
    payload,
    sent_at: Date.now().toString(),
    ...overrides,
  }
}
