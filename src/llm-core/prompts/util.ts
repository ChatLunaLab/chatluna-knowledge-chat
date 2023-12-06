import { Document } from 'langchain/document'
import { ChatLunaChatModel } from 'koishi-plugin-chatluna/lib/llm-core/platform/model'
export async function cropDocuments(
    documents: Document[],
    llm: ChatLunaChatModel
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Document<Record<string, any>>[]> {
    const maxContextSize = llm.getModelMaxContextSize() - 1000

    const result: Document[] = []

    let currentContextSize = 0

    for (let i = documents.length - 1; i >= 0; i--) {
        const doc = documents[i]
        const docTokenSize = await llm.getNumTokens(
            doc.pageContent + ' ' + JSON.stringify(doc.metadata)
        )

        if (currentContextSize + docTokenSize > maxContextSize) {
            break
        }

        currentContextSize += docTokenSize

        result.push(doc)
    }

    return result
}
