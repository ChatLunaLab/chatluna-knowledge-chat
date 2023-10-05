import { BaseRetrieverInput } from 'langchain/schema/retriever'
import {
    VectorStore,
    VectorStoreRetrieverMMRSearchKwargs
} from 'langchain/vectorstores/base'

export type MultiVectorStoreRetrieverInput<V extends VectorStore> =
    BaseRetrieverInput &
        (
            | {
                  vectorStores: V[]
                  k?: number
                  filter?: V['FilterType']
                  searchType?: 'similarity'
              }
            | {
                  vectorStores: V[]
                  k?: number
                  filter?: V['FilterType']
                  searchType: 'mmr'
                  searchKwargs?: VectorStoreRetrieverMMRSearchKwargs
              }
        )
