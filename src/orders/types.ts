import type {
  FulfillListingResponse as ApiFulfillListingResponse,
  FulfillmentData as ApiFulfillmentData,
} from "@opensea/api-types"
import type { OrderWithCounter } from "@opensea/seaport-js/lib/types"
import type { OpenSeaAccount, OrderSide } from "../types"
import type { Camelize } from "../utils/case"

// Protocol data
type OrderProtocolToProtocolData = {
  seaport: OrderWithCounter
}
export type OrderProtocol = keyof OrderProtocolToProtocolData
export type ProtocolData =
  OrderProtocolToProtocolData[keyof OrderProtocolToProtocolData]

export enum OrderType {
  BASIC = "basic",
  ENGLISH = "english",
  CRITERIA = "criteria",
}

type OrderFee = {
  account: OpenSeaAccount
  basisPoints: string
}

/**
 * The latest OpenSea Order schema.
 */
export type OrderV2 = {
  /** The date the order was created. */
  createdDate: string
  /** The date the order was closed. */
  closingDate: string | null
  /** The date the order was listed. Order can be created before the listing time. */
  listingTime: number
  /** The date the order expires. */
  expirationTime: number
  /** The hash of the order. */
  orderHash: string | null
  /** The account that created the order. */
  maker: OpenSeaAccount
  /** The account that filled the order. */
  taker: OpenSeaAccount | null
  /** The protocol data for the order. Only 'seaport' is currently supported. */
  protocolData: ProtocolData
  /** The contract address of the protocol. */
  protocolAddress: string
  /** The current price of the order. */
  currentPrice: bigint
  /** The maker fees for the order. */
  makerFees: OrderFee[]
  /** The taker fees for the order. */
  takerFees: OrderFee[]
  /** The side of the order. Listing/Offer */
  side: OrderSide
  /** The type of the order. Basic/English/Criteria */
  orderType: OrderType
  /** Whether or not the maker has cancelled the order. */
  cancelled: boolean
  /** Whether or not the order is finalized. */
  finalized: boolean
  /** Whether or not the order is marked invalid and therefore not fillable. */
  markedInvalid: boolean
  /** The signature the order is signed with. */
  clientSignature: string | null
  /** Amount of items left in the order which can be taken. */
  remainingQuantity: number
}

/**
 * Response from the fulfillment data endpoints. Camelized from
 * `@opensea/api-types`, with `orders` narrowed to the seaport-js
 * `ProtocolData` shape the SDK hands back to callers.
 *
 * The generated `transaction` carries `calldataSuffix`, the 4-byte attribution
 * suffix {@link FulfillmentManager.fulfillOrder} appends to the calldata, and
 * `inputData` covers all seven Seaport calls the API can return rather than the
 * four the SDK used to declare.
 */
export type FulfillmentDataResponse = Camelize<
  Omit<ApiFulfillListingResponse, "fulfillment_data">
> & {
  fulfillmentData: Camelize<Omit<ApiFulfillmentData, "orders">> & {
    orders: ProtocolData[]
  }
}

// API query types
export type QueryCursors = {
  next: string | null
  previous: string | null
}
