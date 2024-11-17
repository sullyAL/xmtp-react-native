import type { WalletClient } from 'viem'

export type WalletType = 'EOA' | 'SCW'

export interface Signer {
  getAddress: () => Promise<string>
  getChainId: () => number | undefined
  getBlockNumber: () => number | undefined
  walletType: () => WalletType | undefined
  signMessage: (message: string) => Promise<string>
}

export function getSigner(wallet: Signer | WalletClient | null): Signer | null {
  if (!wallet) {
    return null
  }
  if (isWalletClient(wallet)) {
    return convertWalletClientToSigner(wallet)
  }
  if (typeof wallet.getAddress !== 'function') {
    throw new Error('Unknown wallet type')
  }
  return wallet
}

function isWalletClient(wallet: Signer | WalletClient): wallet is WalletClient {
  return 'type' in wallet && wallet.type === 'walletClient'
}

export function convertWalletClientToSigner(
  walletClient: WalletClient
): Signer {
  const { account } = walletClient
  if (!account || !account.address) {
    throw new Error('WalletClient is not configured')
  }

  return {
    getAddress: async () => account.address,
    signMessage: async (message: string | Uint8Array) =>
      walletClient.signMessage({
        message: typeof message === 'string' ? message : { raw: message },
        account,
      }),
    getChainId: () => undefined,
    getBlockNumber: () => undefined,
    walletType: () => undefined,
  }
}
