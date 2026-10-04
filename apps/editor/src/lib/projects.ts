import { create } from 'zustand'
import type { ProjectSummary } from '@prompttoppt/api-client'
import { api } from './api'

/** Sidebar + pages share one list so creating/deleting a project updates everywhere at once. */
interface ProjectsState {
  projects: ProjectSummary[]
  loaded: boolean
  load: () => Promise<void>
  create: (name: string) => Promise<ProjectSummary>
  remove: (id: string) => Promise<void>
  rename: (id: string, name: string) => Promise<void>
}

export const useProjects = create<ProjectsState>((set, get) => ({
  projects: [],
  loaded: false,
  load: async () => {
    try {
      set({ projects: await api.listProjects(), loaded: true })
    } catch {
      set({ loaded: true })
    }
  },
  create: async (name) => {
    const p = await api.createProject(name)
    set({ projects: [p, ...get().projects] })
    return p
  },
  remove: async (id) => {
    await api.deleteProject(id)
    set({ projects: get().projects.filter((p) => p.id !== id) })
  },
  rename: async (id, name) => {
    await api.renameProject(id, name)
    set({ projects: get().projects.map((p) => (p.id === id ? { ...p, name } : p)) })
  },
}))
