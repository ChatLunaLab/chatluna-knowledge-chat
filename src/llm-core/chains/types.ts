import { ChainValues } from '@langchain/core/utils/types'

export interface QAChainValues extends ChainValues {
    sourceDocuments?: Document[]
}
