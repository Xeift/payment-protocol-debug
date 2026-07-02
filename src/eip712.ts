import { printBlock, printJson } from './output.js'

type Eip712Signer = {
    signTypedData: (parameters: any) => Promise<`0x${string}`>
}

export function withEip712Logging<T extends Eip712Signer>(account: T): T {
    return {
        ...account,
        async signTypedData(parameters: Parameters<T['signTypedData']>[0]) {
            await printBlock(
                'EIP-712 SIGN TYPED DATA',
                [
                    {
                        title: 'SIGN_TYPED_DATA PARAMETERS',
                        print: () => {
                            printJson(parameters)
                        },
                    },
                ],
                'yellow',
            )

            return account.signTypedData(parameters)
        },
    }
}
