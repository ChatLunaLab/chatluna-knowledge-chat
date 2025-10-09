import { Document } from '@langchain/core/documents'
import { randomUUID } from 'crypto'
import { Context, h, Session } from 'koishi'
import type { OneBotBot } from 'koishi-plugin-adapter-onebot'
import { ChatLunaChatModel } from 'koishi-plugin-chatluna/llm-core/platform/model'
import { DefaultDocumentLoader } from './document-loader'
import path from 'path'
import fs from 'fs/promises'
import os from 'os'
import { logger } from '.'
import { Config } from './config'
import type {
    RAGRetrieverConfig,
    RetrievalStrategy,
    RetrieverConfig,
    StandardRAGRetrieverConfig
} from 'koishi-plugin-chatluna-vector-store-service'

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

export function chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const result: T[][] = []
    let startIndex = 0

    try {
        while (startIndex < array.length) {
            // 直接使用下标构建子数组
            const endIndex = Math.min(startIndex + chunkSize, array.length)
            result.push(array.slice(startIndex, endIndex))
            startIndex += chunkSize
        }
    } catch (error) {
        console.error('An error occurred:', error)
    }

    return result
}

export function formatFilePath(filePath: string): string {
    if (!filePath) return filePath

    if (filePath.startsWith('file://')) {
        return filePath.substring(7)
    }

    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
        return filePath
    }

    return filePath
}

export function isFilePath(text: string): boolean {
    if (!text || text.length < 3) return false

    if (text.startsWith('http://') || text.startsWith('https://')) return true

    if (
        text.match(/^[a-zA-Z]:[\\\/]/) ||
        text.startsWith('/') ||
        text.startsWith('./') ||
        text.startsWith('../')
    ) {
        return true
    }

    if (text.startsWith('file://')) return true

    return false
}

export async function downloadFile(session: Session, file: h) {
    const url = file.attrs['src'] as string

    if (url.startsWith('file')) {
        return url.substring(7)
    } else if (url.startsWith('http')) {
        console.log(url)
        const response = await session.app.http(url, {
            responseType: 'arraybuffer',
            method: 'GET'
        })

        const tmpDir = await fs.mkdtemp(
            path.join(os.tmpdir(), 'chatluna/knowledge')
        )
        const filePath = path.join(
            tmpDir,
            path.basename(
                file['name'] || file['filename'] || file['file_name'] || url
            )
        )

        logger.debug(`Downloading file from ${url} to ${filePath}`)

        await fs.mkdir(tmpDir, { recursive: true })
        await fs.writeFile(filePath, Buffer.from(response.data))

        return filePath
    } else if (url.startsWith('base64') || url.startsWith('data:base64')) {
        const base64Data = url.split(',')[1]
        const buffer = Buffer.from(base64Data, 'base64')

        const tmpDir = await fs.mkdtemp(
            path.join(os.tmpdir(), 'chatluna/knowledge')
        )
        const randomFileName = `${randomUUID()}`

        const filePath = path.join(tmpDir, randomFileName)

        logger.debug(`Downloading base64 file to ${filePath}`)

        await fs.mkdir(tmpDir, { recursive: true })
        await fs.writeFile(filePath, buffer)

        return filePath
    }

    const bot = session.bot

    if (bot.platform === 'onebot') {
        const onebotBot = bot as OneBotBot<Context>

        let fileUrl = ''

        if (session.isDirect) {
            fileUrl = await onebotBot.internal
                ._request('get_private_file_url', {
                    file_id: file['fileId']
                })
                .then((res) => {
                    if (!res.data) {
                        logger.error(res)
                    }
                    return res['data']?.['url']
                })
        } else {
            fileUrl = await onebotBot.internal
                ._request('get_group_file_url', {
                    file_id: file['fileId'],
                    group_id: session.guildId
                })
                .then((res) => {
                    if (!res.data) {
                        logger.error(res)
                    }
                    return res['data']?.['url']
                })
        }

        if (!fileUrl) {
            logger.error(`Failed to get file url`)
            return Promise.reject(new Error(`Failed to get file url`))
        }

        logger.debug(`Downloading file from ${fileUrl}`)

        return await downloadFile(
            session,
            h('file', {
                ...file.attrs,
                src: fileUrl
            })
        )
    }

    throw new Error(`不支持的文件类型：${url}, 使用的平台: ${bot.platform}`)
}

export async function downloadHttpFile(
    session: Session,
    url: string
): Promise<string> {
    return await downloadFile(session, h('file', { src: url }))
}

export async function collectFiles(
    session: Session,
    loader: DefaultDocumentLoader,
    initialPath?: string
): Promise<string[]> {
    const allFilePaths: string[] = []

    if (initialPath && typeof initialPath === 'string') {
        const formattedPath = formatFilePath(initialPath)
        const supported = await loader.support(formattedPath)
        if (!supported) {
            throw new Error(`不支持的文件类型：${formattedPath}`)
        }

        if (
            formattedPath.startsWith('http://') ||
            formattedPath.startsWith('https://')
        ) {
            const downloadedPath = await downloadFile(
                session,
                h('file', { src: formattedPath })
            )
            allFilePaths.push(downloadedPath)
            await session.send(`已下载初始文件：${formattedPath}`)
        } else {
            allFilePaths.push(formattedPath)
            await session.send(`已添加初始文件：${formattedPath}`)
        }
    }

    await session.send(
        '请发送文件以上传。支持直接发送文件，或本地文件，或远程文件路径（可直接下载）。回复 Y 继续上传，Q 退出上传。'
    )

    while (true) {
        const prompt = await session.prompt(
            (session) => {
                const fileElements = h.select(session.elements, 'file')
                const textElements = h.select(session.elements, 'text')
                return fileElements.length > 0
                    ? fileElements
                    : textElements.join('').trim()
            },
            { timeout: 30 * 1000 }
        )

        if (prompt == null) {
            await session.send('超时未响应，上传已取消。')
            break
        }

        if (Array.isArray(prompt)) {
            await processFileElements(session, loader, prompt, allFilePaths)
        } else if (prompt === 'Y') {
            continue
        } else if (prompt === 'Q') {
            break
        } else {
            await processTextInput(session, loader, prompt.trim(), allFilePaths)
        }

        await session.send(
            '请发送文件以上传。支持直接发送文件，或本地文件，或远程文件路径（可直接下载）。回复 Y 继续上传，Q 退出上传。'
        )
    }

    return allFilePaths
}

async function processFileElements(
    session: Session,
    loader: DefaultDocumentLoader,
    fileElements: h[],
    allFilePaths: string[]
) {
    for (const fileElement of fileElements) {
        const filePath =
            fileElement.attrs['filename'] ??
            fileElement.attrs['file_name'] ??
            fileElement.attrs['file'] ??
            fileElement.attrs['name'] ??
            fileElement.attrs['src']

        const supported = await loader.support(filePath)
        if (!supported) {
            await session.send(`不支持的文件类型：${filePath}`)
            continue
        }

        try {
            const downloadedPath = await downloadFile(session, fileElement)
            if (downloadedPath) {
                allFilePaths.push(downloadedPath)
                await session.send(`已下载文件：${filePath}`)
            }
        } catch (error) {
            await session.send(`下载文件失败：${filePath} - ${error.message}`)
        }
    }
}

async function processTextInput(
    session: Session,
    loader: DefaultDocumentLoader,
    text: string,
    allFilePaths: string[]
) {
    if (!isFilePath(text)) {
        await session.send(
            '输入的文本不是有效的文件路径。请发送文件或输入正确的文件路径。'
        )
        return
    }

    const formattedPath = formatFilePath(text)
    const supported = await loader.support(formattedPath)
    if (!supported) {
        await session.send(`不支持的文件类型：${formattedPath}`)
        return
    }

    try {
        if (
            formattedPath.startsWith('http://') ||
            formattedPath.startsWith('https://')
        ) {
            const downloadedPath = await downloadHttpFile(
                session,
                formattedPath
            )
            allFilePaths.push(downloadedPath)
            await session.send(`已下载文件：${formattedPath}`)
        } else {
            allFilePaths.push(formattedPath)
            await session.send(`已添加文件路径：${formattedPath}`)
        }
    } catch (error) {
        await session.send(`处理文件失败：${formattedPath} - ${error.message}`)
    }
}

// 统一的文档处理和上传
export async function processAndUploadDocuments(
    ctx: Context,
    session: Session,
    knowledgeBaseId: string,
    options: {
        size?: number
        overlap?: number
        chunkType?: string
        initialPath?: string
    }
): Promise<string> {
    const config = ctx.config
    const supportType = ['text', 'code', 'markdown']
    const chunkType = options.chunkType ?? config.chunkType

    if (!supportType.includes(chunkType)) {
        return `不支持的切块类型：${chunkType}。目前支持的类型有：${supportType.join(', ')}`
    }

    try {
        const loader = ctx.chatluna_knowledge.loader

        // 收集所有文件路径（统一处理）
        const filePaths = await collectFiles(
            session,
            loader,
            options.initialPath
        )

        if (filePaths.length === 0) {
            return '没有找到有效的文件！请检查文件路径或重新上传。'
        }

        logger.debug(`Final ${filePaths.length} files`, filePaths)

        // 加载并分块文档
        const documents = await Promise.all(
            filePaths.map((filePath) => {
                return loader.load(filePath, {
                    chunkOverlap: options.overlap ?? config.chunkOverlap,
                    chunkSize: options.size ?? config.chunkSize,
                    type: chunkType
                })
            })
        ).then((results) => results.flat())

        await session.send(
            `已解析成 ${documents.length} 个文档块，正在上传到指定的知识库...`
        )

        // 上传到知识库
        const uploadedIds = await ctx.chatluna_knowledge.uploadDocument(
            knowledgeBaseId,
            documents
        )

        return `成功上传 ${documents.length} 个文档块到知识库！
文档ID范围：${uploadedIds.length > 0 ? `${uploadedIds[0]} ~ ${uploadedIds[uploadedIds.length - 1]}` : '无'}`
    } catch (error) {
        logger.error(error)
        return `上传失败：${error.message}`
    }
}

/**
 * Create StandardRAG configuration from plugin config
 */
export function createStandardRAGConfig(
    config: Config,
    baseConfig: RetrieverConfig,
    llm: ChatLunaChatModel
): StandardRAGRetrieverConfig {
    const retrievalType: RetrievalStrategy =
        config.standardMode as RetrievalStrategy

    return {
        ...baseConfig,
        llm,
        retrievalType
    }
}

/**
 * Create HippoRAG configuration from plugin config
 */
export function createHippoRAGConfig(
    ctx: Context,
    config: Config,
    baseConfig: RetrieverConfig,
    llm: ChatLunaChatModel
): RAGRetrieverConfig<'hippo_rag'> {
    return {
        ...baseConfig,
        llm,
        config: {
            retrievalTopK: config.hippoRetrievalTopK,
            linkingTopK: config.hippoLinkingTopK,
            passageNodeWeight: config.hippoPassageNodeWeight,
            damping: config.hippoDamping,
            synonymyEdgeTopK: config.hippoSynonymyEdgeTopK,
            synonymyEdgeSimThreshold: config.hippoSynonymyEdgeSimThreshold,
            synonymyEdgeKeyBatchSize: 20,
            synonymyEdgeQueryBatchSize: 20,
            saveDir: path.join(
                ctx.baseDir,
                'data/chatluna/knowledge/hippo_rag',
                baseConfig.vectorStoreKey
            ),
            key: baseConfig.vectorStoreKey,
            isDirectedGraph: false
        }
    }
}

/**
 * Create LightRAG configuration from plugin config
 */
export function createLightRAGConfig(
    config: Config,
    baseConfig: RetrieverConfig,
    llm?: ChatLunaChatModel
): RAGRetrieverConfig<'light_rag'> {
    const queryMode = config.lightragQueryMode

    return {
        ...baseConfig,
        llm,
        baseUrl: config.lightragBaseUrl,
        apiKey: config.lightragApiKey,
        defaultQueryMode: queryMode
    }
}
