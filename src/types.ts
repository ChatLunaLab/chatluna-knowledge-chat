export interface RawKnowledgeConfig {
    query?: (string | { include: string })[]
    name: string
    messages: {
        role: string
        content: string
    }[]
    path: string
}

export interface KnowledgeConfig {
    path: string
    id: string
    vector_storage: string
    embeddings: string
}

declare module 'koishi' {
    interface Tables {
        chathub_knowledge: KnowledgeConfig
    }
}
