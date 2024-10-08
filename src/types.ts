export interface DocumentConfig {
    path: string
    id: string
    name: string
    vector_storage: string
    embeddings: string
}

declare module 'koishi' {
    interface Tables {
        chathub_knowledge: DocumentConfig
    }
}
