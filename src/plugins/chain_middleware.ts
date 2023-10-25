import {
    ChainMiddlewareContext,
    ChainMiddlewareRunStatus,
    ChatChain
} from '@dingyi222666/koishi-plugin-chathub/lib/chains/chain'
import { Context, h, Session } from 'koishi'
import { Config, knowledgeConfigService } from '..'
import { ChatHubPlugin } from '@dingyi222666/koishi-plugin-chathub/lib/services/chat'
import type {} from '@dingyi222666/koishi-plugin-chathub/lib/middlewares/resolve_room'
import { setRoomKnowledgeConfig } from './command'
import {
    checkAdmin,
    getAllJoinedConversationRoom
} from '@dingyi222666/koishi-plugin-chathub/lib/chains/rooms'

export async function apply(
    ctx: Context,
    config: Config,
    plugin: ChatHubPlugin,
    chain: ChatChain
): Promise<void> {
    chain
        .middleware(
            'set_knowledge_config',
            (session, middlewareContext) =>
                knowledgeConfigMiddleware(ctx, session, middlewareContext),
            ctx
        )
        .after('lifecycle-handle_command')
}

async function knowledgeConfigMiddleware(
    ctx: Context,
    session: Session,
    middlewareContext: ChainMiddlewareContext
): Promise<string | h[] | h[][] | ChainMiddlewareRunStatus | null> {
    let {
        command,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        options: { room }
    } = middlewareContext

    if (command !== 'set_knowledge_config') {
        return ChainMiddlewareRunStatus.SKIPPED
    }

    if (room == null && middlewareContext.options.room_resolve != null) {
        // 尝试完整搜索一次

        const rooms = await getAllJoinedConversationRoom(ctx, session, true)

        const roomId = parseInt(middlewareContext.options.room_resolve?.name)

        room = rooms.find(
            (room) =>
                room.roomName ===
                    middlewareContext.options.room_resolve?.name ||
                room.roomId === roomId
        )
    }

    if (room == null) {
        middlewareContext.message = '未找到指定的房间。'
        return ChainMiddlewareRunStatus.STOP
    }

    if (room.roomMasterId !== session.userId && !(await checkAdmin(session))) {
        middlewareContext.message = '你不是房间的房主，无法设置房间的属性'
        return ChainMiddlewareRunStatus.STOP
    }

    await setRoomKnowledgeConfig(
        ctx,
        knowledgeConfigService,
        room.conversationId,
        middlewareContext.options.knowledge_config
    )

    middlewareContext.message = `已将房间 ${room.roomName} 的知识库配置设置为 ${middlewareContext.options.knowledge_config}`

    return ChainMiddlewareRunStatus.STOP
}

declare module '@dingyi222666/koishi-plugin-chathub/lib/chains/chain' {
    interface ChainMiddlewareName {
        set_knowledge_config: never
    }
    interface ChainMiddlewareContextOptions {
        knowledge_config: string
    }
}
