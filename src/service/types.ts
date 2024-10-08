import { KnowledgeService } from './knowledge'
declare module 'koishi' {
    export interface Context {
        chatluna_knowledge: KnowledgeService
    }
}
