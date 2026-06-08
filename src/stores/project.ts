import { create } from 'zustand'
import { db } from '../lib/db/schema'
import type { Project, CreateProjectInput } from '../lib/types'
import { migrateGenre } from '../lib/types'
import { requireBackupBefore } from '../lib/safety/require-backup-before'
import { masterBlobId } from '../lib/master-study/pipeline'

interface ProjectStore {
  projects: Project[]
  currentProjectId: number | null
  loading: boolean

  loadProjects: () => Promise<void>
  loadProject: (id: number) => Promise<Project | undefined>
  createProject: (data: CreateProjectInput) => Promise<number>
  updateProject: (id: number, data: Partial<Project>) => Promise<void>
  deleteProject: (id: number) => Promise<void>
  setCurrentProject: (id: number | null) => void
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  currentProjectId: null,
  loading: false,

  loadProjects: async () => {
    set({ loading: true })
    const raw = await db.projects.orderBy('updatedAt').reverse().toArray()
    // 兼容旧数据：确保每条记录都有 genres[] 和 status
    const projects = raw.map(migrateGenre)
    set({ projects, loading: false })
  },

  loadProject: async (id: number) => {
    const raw = await db.projects.get(id)
    if (!raw) return undefined
    const project = migrateGenre(raw)
    set({ currentProjectId: id })
    return project
  },

  createProject: async (data: CreateProjectInput) => {
    const now = Date.now()
    const id = await db.projects.add({
      ...data,
      genres: data.genres ?? [],
      status: data.status ?? 'drafting',
      createdAt: now,
      updatedAt: now,
    } as Project)
    await get().loadProjects()
    return id as number
  },

  updateProject: async (id: number, data: Partial<Project>) => {
    await db.projects.update(id, { ...data, updatedAt: Date.now() })
    await get().loadProjects()
  },

  deleteProject: async (id: number) => {
    // 数据红线:删项目前强制提示备份(Pre-Phase 0 安全网)
    const proceed = await requireBackupBefore({
      operation: '删除项目',
      projectId: id,
      details: '此操作将清除该项目的全部数据(章节、世界观、角色、词条、状态卡等),不可恢复。',
    })
    if (!proceed) return  // 用户取消

    // 先收集子表外键 ID（需在主表删除前查询）
    const refIds = await db.references.where('projectId').equals(id).primaryKeys()
    const workIds = (await db.masterWorks.where('projectId').equals(id).primaryKeys()) as number[]

    // Phase 0.6: 收集间接归属表的关联键(无 projectId 字段)
    const sessionIds = (await db.importSessions
      .where('projectId').equals(id).primaryKeys()) as number[]
    // 部分老式 MasterWork 直接挂 importSessionId(非 masterBlobId 协议),要额外清理
    const masterRows = await db.masterWorks.where('projectId').equals(id).toArray()
    const legacyMasterSessionIds = masterRows
      .map(w => w.importSessionId)
      .filter((v): v is number => v != null)

    // 删除项目及所有关联数据（Phase 0.6: 加入 importLogs/importFiles/importJobs 间接归属表）
    await db.transaction('rw', [
      db.projects, db.worldviews, db.storyCores, db.powerSystems,
      db.characters, db.factions, db.outlineNodes, db.chapters, db.foreshadows,
      db.geographies, db.histories, db.itemSystems, db.creativeRules,
      db.characterRelations, db.snapshots, db.references,
      db.detailedOutlines, db.emotionBeatCards, db.stateCards,
      db.storyArcs, db.worldNodes, db.notes,
      db.historicalTimelineEvents, db.historicalKeywords,
      db.masterWorks, db.importSessions,
      db.referenceChunkAnalysis, db.masterChunkAnalysis,
      db.masterChapterBeats, db.masterStyleMetrics,
      db.worldGroups, db.worldGroupLinks, db.itemLedger, db.storyTimelineEvents,
      db.importantLocations, db.worldRulesProfiles, db.codexCategories, db.codexEntries, db.aiUsageLog,
      // Phase 0.6: 间接归属表(sessionId 间接挂项目 / blob 复用)
      db.importLogs, db.importFiles, db.importJobs,
    ], async () => {
      // 子表先删（依赖外键）
      if (refIds.length) await db.referenceChunkAnalysis.where('referenceId').anyOf(refIds).delete()
      if (workIds.length) {
        await db.masterChunkAnalysis.where('workId').anyOf(workIds).delete()
        await db.masterChapterBeats.where('workId').anyOf(workIds).delete()
        await db.masterStyleMetrics.where('workId').anyOf(workIds).delete()
      }
      // 主表删除
      await db.projects.delete(id)
      await db.worldviews.where('projectId').equals(id).delete()
      await db.storyCores.where('projectId').equals(id).delete()
      await db.powerSystems.where('projectId').equals(id).delete()
      await db.characters.where('projectId').equals(id).delete()
      await db.factions.where('projectId').equals(id).delete()
      await db.geographies.where('projectId').equals(id).delete()
      await db.histories.where('projectId').equals(id).delete()
      await db.itemSystems.where('projectId').equals(id).delete()
      await db.characterRelations.where('projectId').equals(id).delete()
      await db.worldNodes.where('projectId').equals(id).delete()
      await db.historicalTimelineEvents.where('projectId').equals(id).delete()
      await db.historicalKeywords.where('projectId').equals(id).delete()
      await db.outlineNodes.where('projectId').equals(id).delete()
      await db.chapters.where('projectId').equals(id).delete()
      await db.detailedOutlines.where('projectId').equals(id).delete()
      await db.emotionBeatCards.where('projectId').equals(id).delete()
      await db.stateCards.where('projectId').equals(id).delete()
      await db.storyArcs.where('projectId').equals(id).delete()
      await db.foreshadows.where('projectId').equals(id).delete()
      await db.creativeRules.where('projectId').equals(id).delete()
      await db.notes.where('projectId').equals(id).delete()
      await db.references.where('projectId').equals(id).delete()
      await db.masterWorks.where('projectId').equals(id).delete()
      await db.snapshots.where('projectId').equals(id).delete()
      await db.importSessions.where('projectId').equals(id).delete()
      // Phase 25.4: 多世界系统
      await db.worldGroups.where('projectId').equals(id).delete()
      await db.worldGroupLinks.where('projectId').equals(id).delete()
      // Phase 25.5.2-b: 物品流水
      await db.itemLedger.where('projectId').equals(id).delete()
      // Phase 25.5.2-a: 故事进程年表
      await db.storyTimelineEvents.where('projectId').equals(id).delete()
      // 此前漏删（删项目后会留孤儿）：重要地点 / 真实与幻想 / 设定词条 / 消耗统计
      await db.importantLocations.where('projectId').equals(id).delete()
      await db.worldRulesProfiles.where('projectId').equals(id).delete()
      await db.codexCategories.where('projectId').equals(id).delete()
      await db.codexEntries.where('projectId').equals(id).delete()
      await db.aiUsageLog.where('projectId').equals(id).delete()

      // Phase 0.6: 间接归属表清理(GPT-5.5 + Gemini 双重审查发现的孤儿数据)
      // 灾难:用户导入 10MB 小说 blob 后删项目 → blob 永久残留 → IndexedDB 配额爆
      // -----------------------------------------------------------------
      // (1) importLogs / importFiles 通过 sessionId 间接挂项目;
      //     importFiles 主键就是 sessionId(见 schema.ts: 'sessionId, fileHash, createdAt')
      if (sessionIds.length) {
        await db.importLogs.where('sessionId').anyOf(sessionIds).delete()
        // bulkDelete 用主键数组(sessionId 即主键)
        await db.importFiles.bulkDelete(sessionIds)
      }
      // (2) master 作品的原文 blob 复用 importFiles,虚拟 sessionId = 100000+workId
      //     (见 src/lib/master-study/pipeline.ts masterBlobId)
      if (workIds.length) {
        await db.importFiles.bulkDelete(workIds.map(wid => masterBlobId(wid)))
      }
      // (3) 极少数老式 MasterWork 直接挂 importSessionId 而非走 masterBlobId 协议,
      //     这些 sessionId 不一定在 importSessions 表里(可能是孤立的 blob)
      if (legacyMasterSessionIds.length) {
        await db.importFiles.bulkDelete(legacyMasterSessionIds)
      }
      // (4) importJobs 直接有 projectId,按字段删
      await db.importJobs.where('projectId').equals(id).delete()
    })
    if (get().currentProjectId === id) {
      set({ currentProjectId: null })
    }
    await get().loadProjects()
  },

  setCurrentProject: (id: number | null) => {
    set({ currentProjectId: id })
  },
}))
