import { VectorStore, VectorStoreRetriever } from '@langchain/core/vectorstores'
import { MultiVectorStoreRetrieverInput } from './types'
import { Document } from '@langchain/core/documents'
import {
    ChatLunaError,
    ChatLunaErrorCode
} from 'koishi-plugin-chatluna/utils/error'

export type ScoreThresholdRetrieverInput<V extends VectorStore> = Omit<
    MultiVectorStoreRetrieverInput<V>,
    'k'
> & {
    maxK?: number
    kIncrement?: number
    minSimilarityScore: number
}

export class MultiScoreThresholdRetriever<
    V extends VectorStore
> extends VectorStoreRetriever<V> {
    minSimilarityScore: number

    kIncrement = 5

    maxK = 50

    vectorStores: V[]

    constructor(input: ScoreThresholdRetrieverInput<V>) {
        super({
            vectorStore: input.vectorStores?.[0],
            k: input.maxK,
            filter: input.filter,
            searchType: input.searchType
        })
        this.maxK = input.maxK ?? this.maxK
        this.minSimilarityScore =
            input.minSimilarityScore ?? this.minSimilarityScore
        this.kIncrement = input.kIncrement ?? this.kIncrement
        this.vectorStores = input.vectorStores
    }

    async getRelevantDocuments(query: string): Promise<Document[]> {
        const currentKMap: Map<VectorStore, number> = new Map()
        const tempVectorResult: Map<VectorStore, number[]> = new Map()
        let currentIndex = 0
        let vectorStore: VectorStore
        let filteredResults: [Document, number][] = []
        const currentMaxK = (this.maxK * this.vectorStores.length) / 2
        let currentSearchK = 0
        do {
            ;[vectorStore, currentIndex] = this.pickVectorStore(currentIndex)
            const vectorResult =
                tempVectorResult.get(vectorStore) ??
                (await vectorStore.embeddings.embedQuery(query))

            let currentK = currentKMap.get(vectorStore) ?? 0
            currentK += this.kIncrement
            currentSearchK += currentK
            const results = await vectorStore.similaritySearchVectorWithScore(
                vectorResult,
                currentK,
                this.filter
            )
            tempVectorResult.set(vectorStore, vectorResult)
            filteredResults = filteredResults.concat(
                results.filter(([, score]) => score >= this.minSimilarityScore)
            )
            currentKMap.set(vectorStore, currentK)
        } while (
            filteredResults.length < currentMaxK &&
            currentSearchK < currentMaxK
        )

        console.log(filteredResults)
        return filteredResults
            .map((documents) => documents[0])
            .slice(0, this.maxK)
    }

    pickVectorStore(index: number): [VectorStore, number] {
        const vectorStore = this.vectorStores[index]

        let nextIndex = index + 1

        if (nextIndex >= this.vectorStores.length) {
            nextIndex = 0
        }

        return [vectorStore, nextIndex]
    }

    static fromVectorStores<V extends VectorStore>(
        vectorStores: V[],
        options: Omit<ScoreThresholdRetrieverInput<V>, 'vectorStores'>
    ) {
        if (vectorStores.length < 1) {
            throw new ChatLunaError(
                ChatLunaErrorCode.KNOWLEDGE_VECTOR_NOT_FOUND
            )
        }
        return new this<V>({ ...options, vectorStores })
    }
}
