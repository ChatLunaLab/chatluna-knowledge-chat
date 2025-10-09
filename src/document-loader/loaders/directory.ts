import { Document } from '@langchain/core/documents'
import { DocumentLoader, DocumentLoaderFields } from '../types'
import fs from 'fs/promises'
import { logger } from 'koishi-plugin-chatluna-knowledge-chat'
import path from 'path'

export default class DirectoryLoader extends DocumentLoader {
    public async load(
        filePath: string,
        fields: DocumentLoaderFields
    ): Promise<Document[]> {
        const fileList = (
            await fs.readdir(filePath, { withFileTypes: true, recursive: true })
        )
            .filter((value) => value.isFile())
            .map((value) => path.join(value.parentPath, value.name))

        let result: Document[] = []

        for (const subPath of fileList) {
            logger.debug(`parse document ${subPath}`)
            const subDocuments = await this.parent?.load(subPath, fields)

            if (!subDocuments) {
                continue
            }

            result = result.concat(subDocuments)
        }

        return result
    }

    public async support(path: string): Promise<boolean> {
        try {
            const stat = await fs.stat(path)

            return stat.isDirectory()
        } catch (e) {
            return false
        }
    }
}
