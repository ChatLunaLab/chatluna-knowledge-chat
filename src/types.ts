export interface RawKnowledgeConfig {
    query?: (string | { include: string })[]
    name: string
    messages: {
        role: string
        content: string
    }[]
}
