import { KnowledgeConfigService, KnowledgeService } from './knowledge'
declare module 'koishi' {
    export interface Context {
        chatluna_knowledge_config: KnowledgeConfigService
        chatluna_knowledge: KnowledgeService
    }
}
