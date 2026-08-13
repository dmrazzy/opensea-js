import type {
  CreateOrderAction,
  OrderComponents,
  OrderUseCase,
} from "@opensea/seaport-js/lib/types"
import { ZeroAddress, ZeroHash } from "ethers"
import { describe, expect, test, vi } from "vitest"
import { executeApprovalsAndGetOrderComponents } from "../../src/orders/orderUseCase"

const orderComponents = {
  offerer: "0x1111111111111111111111111111111111111111",
  zone: ZeroAddress,
  offer: [
    {
      itemType: 2,
      token: "0x2222222222222222222222222222222222222222",
      identifierOrCriteria: "1234",
      startAmount: "1",
      endAmount: "1",
    },
  ],
  consideration: [
    {
      itemType: 1,
      token: "0x3333333333333333333333333333333333333333",
      identifierOrCriteria: "0",
      startAmount: "975000000000000000",
      endAmount: "975000000000000000",
      recipient: "0x1111111111111111111111111111111111111111",
    },
  ],
  orderType: 2,
  startTime: "0",
  endTime: "1000000000000",
  zoneHash: ZeroHash,
  // seaport-js emits salt as padded hex. It now reaches the caller untouched,
  // because the components come straight from _formatOrder rather than from a
  // typed-data payload that would have rendered it as decimal.
  salt: "0x000000000000000000000000000000000000000000000000f1a2b3c400003039",
  conduitKey: ZeroHash,
  counter: "7",
  totalOriginalConsiderationItems: 1,
} as unknown as OrderComponents

const buildUseCase = ({
  approvalCount = 0,
  includeCreateAction = true,
}: {
  approvalCount?: number
  includeCreateAction?: boolean
} = {}) => {
  const executeApprovals = vi.fn().mockResolvedValue(undefined)
  const createOrder = vi.fn()
  const actions = [
    ...Array.from({ length: approvalCount }, () => ({
      type: "approval" as const,
    })),
    ...(includeCreateAction
      ? [
          {
            type: "create" as const,
            orderComponents,
            getMessageToSign: vi.fn(),
            createOrder,
          },
        ]
      : []),
  ]

  return {
    useCase: {
      actions,
      executeAllActions: vi.fn(),
      executeApprovals,
    } as unknown as OrderUseCase<CreateOrderAction>,
    executeApprovals,
    createOrder,
  }
}

describe("orders: executeApprovalsAndGetOrderComponents", () => {
  test("returns the components seaport-js built, untouched", async () => {
    const { useCase } = buildUseCase({ approvalCount: 1 })

    const components = await executeApprovalsAndGetOrderComponents(useCase)

    expect(components).toBe(orderComponents)
  })

  test("runs the approvals", async () => {
    const { useCase, executeApprovals } = buildUseCase({ approvalCount: 2 })

    await executeApprovalsAndGetOrderComponents(useCase)

    expect(executeApprovals).toHaveBeenCalledTimes(1)
  })

  test("never requests a signature", async () => {
    const { useCase, createOrder } = buildUseCase({ approvalCount: 1 })

    await executeApprovalsAndGetOrderComponents(useCase)

    expect(createOrder).not.toHaveBeenCalled()
  })

  test("surfaces a failed approval instead of returning components", async () => {
    const { useCase, executeApprovals } = buildUseCase({ approvalCount: 1 })
    executeApprovals.mockRejectedValue(
      new Error("transaction execution reverted"),
    )

    await expect(
      executeApprovalsAndGetOrderComponents(useCase),
    ).rejects.toThrow("transaction execution reverted")
  })

  test("approves before reading the components", async () => {
    const sequence: string[] = []
    const { useCase, executeApprovals } = buildUseCase({ approvalCount: 1 })
    executeApprovals.mockImplementation(async () => {
      sequence.push("approvals")
    })

    await executeApprovalsAndGetOrderComponents(useCase)
    sequence.push("components")

    expect(sequence).toEqual(["approvals", "components"])
  })

  test("throws when the use case has no create action", async () => {
    const { useCase } = buildUseCase({ includeCreateAction: false })

    await expect(
      executeApprovalsAndGetOrderComponents(useCase),
    ).rejects.toThrow("no create action")
  })
})
