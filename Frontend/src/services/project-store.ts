import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  eventBelongsToChapter,
  INITIAL_PROJECTS,
  StoryChapter,
  StoryLink,
  StoryNode,
  StoryProject,
} from '@/constants/story-data';
import { api, ApiError } from '@/services/api';

const CUSTOM_PROJECTS_KEY_PREFIX = '@story_app_custom_projects_';
const PROJECT_CACHE_PREFIX = '@story_app_project_cache_';

interface AccountContext {
  accountId: string;
  version: number;
}

function getEventNodesForChapter(project: StoryProject, chapter: StoryChapter): StoryNode[] {
  return (project.nodes || []).filter((node) => eventBelongsToChapter(node, chapter));
}

function getReplacementChapter(
  project: StoryProject,
  removedChapterId: string,
  eventNode: StoryNode
): StoryChapter | undefined {
  return (project.chapters || []).find(
    (chapter) =>
      chapter.id !== removedChapterId &&
      eventBelongsToChapter(eventNode, chapter)
  );
}

export class ProjectStore {
  private memoryProjects: Map<string, StoryProject> = new Map();
  private accountId: string | null = null;
  private accountVersion = 0;
  private projectVersions: Map<string, number> = new Map();
  private graphRequestVersions: Map<string, number> = new Map();
  private chapterMutationTails: Map<string, Promise<void>> = new Map();

  constructor() {
    // Nạp sẵn INITIAL_PROJECTS vào memory
    for (const p of INITIAL_PROJECTS) {
      this.memoryProjects.set(p.id, { ...p });
    }
  }

  setAccountId(accountId: string | null): void {
    const nextAccountId = accountId?.trim() || null;
    if (this.accountId === nextAccountId) return;

    this.accountId = nextAccountId;
    this.accountVersion += 1;
    this.memoryProjects.clear();
    this.projectVersions.clear();
    this.graphRequestVersions.clear();
    for (const project of INITIAL_PROJECTS) {
      this.memoryProjects.set(project.id, { ...project });
    }
  }

  private captureAccountContext(): AccountContext {
    if (!this.accountId) {
      throw new Error('Cần đăng nhập trước khi lưu dự án.');
    }
    return { accountId: this.accountId, version: this.accountVersion };
  }

  private assertAccountContext(context: AccountContext, message: string): void {
    if (
      this.accountVersion !== context.version ||
      this.accountId !== context.accountId
    ) {
      throw new Error(message);
    }
  }

  private getLocalProjectsKey(accountId: string | null): string | null {
    return accountId
      ? `${CUSTOM_PROJECTS_KEY_PREFIX}${encodeURIComponent(accountId)}`
      : null;
  }

  private getProjectCacheKey(projectId: string, accountId: string | null): string | null {
    return accountId
      ? `${PROJECT_CACHE_PREFIX}${encodeURIComponent(accountId)}_${encodeURIComponent(projectId)}`
      : null;
  }

  private async withSerializedChapterMutations<T>(
    projectId: string,
    mutation: () => Promise<T>
  ): Promise<T> {
    const previousMutation = this.chapterMutationTails.get(projectId) || Promise.resolve();
    let release!: () => void;
    const currentMutation = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queuedMutation = previousMutation.then(() => currentMutation);
    this.chapterMutationTails.set(projectId, queuedMutation);

    await previousMutation;
    try {
      return await mutation();
    } finally {
      release();
      if (this.chapterMutationTails.get(projectId) === queuedMutation) {
        this.chapterMutationTails.delete(projectId);
      }
    }
  }

  /**
   * Lấy toàn bộ danh sách dự án
   */
  async getProjects(): Promise<StoryProject[]> {
    const accountId = this.accountId;
    const accountVersion = this.accountVersion;
    if (!accountId) return [];

    try {
      const res = await api.getProjects();
      if (this.accountVersion !== accountVersion) return [];
      if (res.success && Array.isArray(res.data)) {
        // Lưu cache các dự án từ server
        for (const item of res.data) {
          const existing = this.memoryProjects.get(item.id);
          this.memoryProjects.set(item.id, {
            ...existing,
            ...item,
            nodes: existing?.nodes || [],
            links: existing?.links || [],
          });
        }
        return res.data as StoryProject[];
      }
    } catch {
      // Backend không phản hồi, dùng cache / local
    }

    const localProjects = await this.getLocalProjects(accountId);
    if (this.accountVersion !== accountVersion) return [];
    if (localProjects.length > 0) {
      return localProjects;
    }

    return [];
  }

  /**
   * Lấy thông tin chi tiết dự án kèm Nodes và Links của dự án đó.
   * QUAN TRỌNG: Không bao giờ fallback sang dự án khác nếu không tìm thấy!
   */
  async getProject(
    projectId: string,
    options: { preferCache?: boolean } = {}
  ): Promise<StoryProject> {
    const accountId = this.accountId;
    const accountVersion = this.accountVersion;

    if (options.preferCache && this.memoryProjects.has(projectId)) {
      const cached = this.memoryProjects.get(projectId)!;
      return {
        ...cached,
        nodes: [...cached.nodes],
        links: [...cached.links],
        edges: [...(cached.edges || cached.links)],
      };
    }

    if (options.preferCache) {
      const cached = await this.getCachedProjectLocally(projectId, accountId);
      if (this.accountVersion !== accountVersion) {
        throw new Error('Tài khoản đã thay đổi trong lúc tải dự án.');
      }
      if (cached) {
        this.memoryProjects.set(projectId, cached);
        return cached;
      }
    }

    const requestVersion = this.projectVersions.get(projectId) || 0;
    const graphRequestVersion = (this.graphRequestVersions.get(projectId) || 0) + 1;
    this.graphRequestVersions.set(projectId, graphRequestVersion);

    // 1. Thử gọi API Backend để lấy dữ liệu mới nhất từ Neo4j
    try {
      const res = await api.getProjectGraph(projectId);
      if (res.success && res.data) {
        let latestLocalProject =
          this.memoryProjects.get(projectId) || (await this.getCachedProjectLocally(projectId, accountId));
        if (this.accountVersion !== accountVersion) {
          throw new Error('Tài khoản đã thay đổi trong lúc tải dự án.');
        }
        if (
          this.graphRequestVersions.get(projectId) !== graphRequestVersion ||
          (this.projectVersions.get(projectId) || 0) !== requestVersion
        ) {
          if (latestLocalProject) return latestLocalProject;
        }

        const { project, nodes = [], links = [], edges, chapters } = res.data;
        const actualLinks = (Array.isArray(edges) && edges.length > 0 ? edges : links) as StoryLink[];
        const remoteChapters = Array.isArray(chapters)
          ? (chapters as StoryChapter[])
          : project.chapters || [];
        const remoteNodes = nodes as StoryNode[];
        const pendingNodes = (latestLocalProject?.nodes || []).filter(
          (node) => node.syncStatus === 'pending'
        );
        const mergedNodes = [
          ...remoteNodes.map((remoteNode) =>
            pendingNodes.some((pending) => pending.id === remoteNode.id)
              ? { ...remoteNode, syncStatus: 'synced' as const }
              : remoteNode
          ),
          ...pendingNodes.filter(
            (pending) => !remoteNodes.some((node) => node.id === pending.id)
          ),
        ];
        const pendingChapters = (latestLocalProject?.chapters || []).filter(
          (chapter) => chapter.syncStatus === 'pending'
        );
        const mergedChapters = [
          ...remoteChapters,
          ...pendingChapters.filter(
            (pending) =>
              !remoteChapters.some(
                (chapter: StoryChapter) => chapter.id === pending.id
              )
          ),
        ];
        const fullProject: StoryProject = {
          ...project,
          nodeCount: mergedNodes.length,
          linkCount: actualLinks.length,
          nodes: mergedNodes,
          links: actualLinks,
          edges: actualLinks,
          chapters: mergedChapters,
        };
        this.memoryProjects.set(projectId, fullProject);
        await this.cacheProjectLocally(fullProject, accountId);
        if (this.accountVersion !== accountVersion) {
          throw new Error('Tài khoản đã thay đổi trong lúc tải dự án.');
        }
        if (
          this.graphRequestVersions.get(projectId) !== graphRequestVersion ||
          (this.projectVersions.get(projectId) || 0) !== requestVersion
        ) {
          latestLocalProject =
            this.memoryProjects.get(projectId) || (await this.getCachedProjectLocally(projectId, accountId));
          if (latestLocalProject) {
            await this.cacheProjectLocally(latestLocalProject, accountId);
            if (this.accountVersion !== accountVersion) {
              throw new Error('Tài khoản đã thay đổi trong lúc tải dự án.');
            }
            return latestLocalProject;
          }
        }
        return fullProject;
      }
    } catch {
      if (this.accountVersion !== accountVersion) {
        throw new Error('Tài khoản đã thay đổi trong lúc tải dự án.');
      }
      // Bỏ qua lỗi mạng, chuyển sang lấy từ cache / local storage
    }

    // 2. Kiểm tra bộ nhớ tạm (Memory Cache)
    if (this.memoryProjects.has(projectId)) {
      const proj = this.memoryProjects.get(projectId)!;
      // Đảm bảo không dính nodes của dự án khác
      return { ...proj, nodes: [...proj.nodes], links: [...proj.links] };
    }

    // 3. Kiểm tra Local Storage (AsyncStorage)
    const cached = await this.getCachedProjectLocally(projectId, accountId);
    if (this.accountVersion !== accountVersion) {
      throw new Error('Tài khoản đã thay đổi trong lúc tải dự án.');
    }
    if (cached) {
      this.memoryProjects.set(projectId, cached);
      return cached;
    }

    // 4. Kiểm tra xem có trong danh sách INITIAL_PROJECTS mẫu không (chỉ khớp chính xác ID)
    const sample = INITIAL_PROJECTS.find((p) => p.id === projectId);
    if (sample) {
      const clone = JSON.parse(JSON.stringify(sample));
      this.memoryProjects.set(projectId, clone);
      return clone;
    }

    // 5. Nếu là dự án mới chưa có node nào: Trả về dự án sạch (nodes: []), TUYỆT ĐỐI không lấy dự án khác
    const cleanProject: StoryProject = {
      id: projectId,
      title: 'Dự án mới',
      genre: 'Tự do',
      number: '№ 01',
      nodeCount: 0,
      linkCount: 0,
      updatedAt: 'Vừa xong',
      nodes: [],
      links: [],
    };
    this.memoryProjects.set(projectId, cleanProject);
    return cleanProject;
  }

  /**
   * Lưu hoặc cập nhật một dự án
   */
  async saveProject(
    project: StoryProject,
    context: AccountContext = this.captureAccountContext()
  ): Promise<void> {
    this.assertAccountContext(context, 'Tài khoản đã thay đổi trong lúc lưu dự án.');

    this.projectVersions.set(
      project.id,
      (this.projectVersions.get(project.id) || 0) + 1
    );
    this.memoryProjects.set(project.id, { ...project });
    await this.cacheProjectLocally(project, context.accountId);
    this.assertAccountContext(context, 'Tài khoản đã thay đổi trong lúc lưu dự án.');

    // Cập nhật danh sách local projects
    const locals = await this.getLocalProjects(context.accountId);
    this.assertAccountContext(context, 'Tài khoản đã thay đổi trong lúc lưu dự án.');
    const idx = locals.findIndex((p) => p.id === project.id);
    if (idx >= 0) {
      locals[idx] = { ...locals[idx], ...project };
    } else {
      locals.unshift(project);
    }
    const localProjectsKey = this.getLocalProjectsKey(context.accountId);
    if (localProjectsKey) {
      await AsyncStorage.setItem(localProjectsKey, JSON.stringify(locals));
    }
  }

  /**
   * Tạo một Node mới trong Project
   */
  async createNode(projectId: string, nodeData: Partial<StoryNode>): Promise<StoryNode> {
    const accountContext = this.captureAccountContext();
    const project = await this.getProject(projectId);
    this.assertAccountContext(
      accountContext,
      'Tài khoản đã thay đổi trong lúc tạo node.'
    );
    const type = nodeData.type || 'character';
    const cleanPrefix = type.slice(0, 4);
    const generatedId = `${cleanPrefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    const defaultStatusByType: Record<string, string> = {
      character: 'Còn sống',
      item: 'Bình thường',
      location: 'Hoạt động',
      faction: 'Hoạt động',
      event: 'Đã diễn ra',
    };

    const newNode: StoryNode = {
      id: generatedId,
      name: nodeData.name?.trim() || 'Thực thể mới',
      type: type,
      role: nodeData.role?.trim() || '',
      desc: nodeData.desc?.trim() || '',
      subType: nodeData.subType?.trim() || '',
      x: typeof nodeData.x === 'number' ? nodeData.x : 180 + (Math.random() * 80 - 40),
      y: typeof nodeData.y === 'number' ? nodeData.y : 350 + (Math.random() * 80 - 40),
      status: nodeData.status?.trim() || defaultStatusByType[type] || 'Hoạt động',
      dob: nodeData.dob?.trim() || '',
      birthplace: nodeData.birthplace?.trim() || '',
      gender: nodeData.gender?.trim() || '',
      weapon: nodeData.weapon?.trim() || '',
      sect: nodeData.sect?.trim() || '',
      personality: nodeData.personality?.trim() || '',
      rarity: nodeData.rarity?.trim() || '',
      origin: nodeData.origin?.trim() || '',
      element: nodeData.element?.trim() || '',
      power: nodeData.power?.trim() || '',
      holderOrLocation: nodeData.holderOrLocation?.trim() || '',
      region: nodeData.region?.trim() || '',
      climate: nodeData.climate?.trim() || '',
      terrain: nodeData.terrain?.trim() || '',
      dangerLevel: nodeData.dangerLevel?.trim() || '',
      ruler: nodeData.ruler?.trim() || '',
      leader: nodeData.leader?.trim() || '',
      headquarters: nodeData.headquarters?.trim() || '',
      motto: nodeData.motto?.trim() || '',
      alignment: nodeData.alignment?.trim() || '',
      influence: nodeData.influence?.trim() || '',
      time: nodeData.time?.trim() || '',
      location: nodeData.location?.trim() || '',
      chapter: nodeData.chapter?.trim() || '',
      charactersInvolved: nodeData.charactersInvolved?.trim() || '',
      characters: nodeData.characters?.trim() || '',
      impact: nodeData.impact?.trim() || '',
      statusEvent: nodeData.statusEvent?.trim() || '',
      syncStatus: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Thử gọi backend để lưu vào Neo4j (không truyền createdAt / updatedAt thủ công)
    try {
      this.assertAccountContext(
        accountContext,
        'Tài khoản đã thay đổi trong lúc tạo node.'
      );
      const { createdAt, updatedAt, syncStatus, ...payloadForBackend } = newNode;
      const res = await api.createNode(projectId, payloadForBackend);
      this.assertAccountContext(
        accountContext,
        'Tài khoản đã thay đổi trong lúc tạo node.'
      );
      if (res.success && res.data) {
        Object.assign(newNode, res.data, { syncStatus: 'synced' });
      }
    } catch (err) {
      this.assertAccountContext(
        accountContext,
        'Tài khoản đã thay đổi trong lúc tạo node.'
      );
      if (err instanceof ApiError) {
        throw err;
      }
      console.warn('[ProjectStore] Không thể lưu node lên Backend, lưu tạm local:', err);
    }

    // Cập nhật bộ nhớ và local cache
    this.assertAccountContext(
      accountContext,
      'Tài khoản đã thay đổi trong lúc tạo node.'
    );
    project.nodes = [...project.nodes, newNode];
    project.nodeCount = project.nodes.length;
    project.edges = project.links;
    await this.saveProject(project, accountContext);

    return newNode;
  }

  async ensureNodeSynced(projectId: string, nodeId: string): Promise<StoryNode> {
    const accountContext = this.captureAccountContext();
    const project = await this.getProject(projectId);
    this.assertAccountContext(
      accountContext,
      'Tài khoản đã thay đổi trong lúc đồng bộ node.'
    );
    const nodeIndex = project.nodes.findIndex((node) => node.id === nodeId);
    if (nodeIndex === -1) {
      throw new Error(`Không tìm thấy node với ID: ${nodeId} trong dự án`);
    }

    const node = project.nodes[nodeIndex];
    if (!node || node.syncStatus !== 'pending') return node;

    const verifyRemoteNode = async (): Promise<StoryNode | undefined> => {
      this.assertAccountContext(
        accountContext,
        'Tài khoản đã thay đổi trong lúc đồng bộ node.'
      );
      const response = await api.getNode(nodeId);
      this.assertAccountContext(
        accountContext,
        'Tài khoản đã thay đổi trong lúc đồng bộ node.'
      );
      if (!response.success || !response.data) return undefined;
      if (response.data.id !== nodeId) {
        const error = new Error(`Backend trả về node không khớp ID ${nodeId}`);
        error.name = 'NodeProjectMismatchError';
        throw error;
      }
      if (response.data.projectId !== projectId) {
        const error = new Error(`Node ${nodeId} không thuộc dự án ${projectId}`);
        error.name = 'NodeProjectMismatchError';
        throw error;
      }
      return response.data as StoryNode;
    };

    let remoteNode: StoryNode | undefined;
    try {
      remoteNode = await verifyRemoteNode();
    } catch (err) {
      this.assertAccountContext(
        accountContext,
        'Tài khoản đã thay đổi trong lúc đồng bộ node.'
      );
      if (err instanceof Error && err.name === 'NodeProjectMismatchError') throw err;
    }

    let createError: unknown;
    if (!remoteNode) {
      try {
        this.assertAccountContext(
          accountContext,
          'Tài khoản đã thay đổi trong lúc đồng bộ node.'
        );
        const { syncStatus, createdAt, updatedAt, ...payload } = node;
        const response = await api.createNode(projectId, payload);
        this.assertAccountContext(
          accountContext,
          'Tài khoản đã thay đổi trong lúc đồng bộ node.'
        );
        if (!response.success || !response.data) {
          throw new Error(response.message || 'Backend không xác nhận đã tạo node');
        }
        remoteNode = response.data as StoryNode;
        if (remoteNode.id !== nodeId) {
          throw new Error(`Backend đã tạo node với ID khác ${nodeId}`);
        }
      } catch (err) {
        this.assertAccountContext(
          accountContext,
          'Tài khoản đã thay đổi trong lúc đồng bộ node.'
        );
        createError = err;
        try {
          remoteNode = await verifyRemoteNode();
        } catch (verifyError) {
          const createMessage =
            createError instanceof Error ? createError.message : String(createError);
          const verifyMessage =
            verifyError instanceof Error ? verifyError.message : String(verifyError);
          throw new Error(
            `Không thể đồng bộ node: ${createMessage}. Không xác minh được trạng thái trên máy chủ: ${verifyMessage}`
          );
        }
      }
    }

    if (!remoteNode) {
      throw new Error(
        createError instanceof Error ? createError.message : 'Backend chưa tạo được node.'
      );
    }

    this.assertAccountContext(
      accountContext,
      'Tài khoản đã thay đổi trong lúc đồng bộ node.'
    );
    const latestProject = await this.getProject(projectId, { preferCache: true });
    this.assertAccountContext(
      accountContext,
      'Tài khoản đã thay đổi trong lúc đồng bộ node.'
    );
    const latestNodeIndex = latestProject.nodes.findIndex((item) => item.id === nodeId);
    if (latestNodeIndex === -1) {
      throw new Error(`Node ${nodeId} đã bị xóa trong lúc đồng bộ`);
    }
    const latestNode = latestProject.nodes[latestNodeIndex];
    const syncedNode = { ...remoteNode, ...latestNode, syncStatus: 'synced' as const };
    latestProject.nodes[latestNodeIndex] = syncedNode;
    await this.saveProject(latestProject, accountContext);
    return syncedNode;
  }

  /**
   * Cập nhật thông tin của một Node
   */
  async updateNode(
    projectId: string,
    nodeId: string,
    updates: Partial<StoryNode>,
    options: { requireBackend?: boolean } = {}
  ): Promise<StoryNode> {
    const accountContext = this.captureAccountContext();
    const project = await this.getProject(projectId);
    this.assertAccountContext(
      accountContext,
      'Tài khoản đã thay đổi trong lúc cập nhật node.'
    );
    const index = project.nodes.findIndex((n) => n.id === nodeId);
    if (index === -1) {
      throw new Error(`Không tìm thấy node với ID: ${nodeId} trong dự án`);
    }

    const effectiveUpdates =
      updates.charactersInvolved !== undefined && updates.characters === undefined
        ? { ...updates, characters: '' }
        : updates;
    const updatedNode: StoryNode = {
      ...project.nodes[index],
      ...effectiveUpdates,
      updatedAt: Date.now(),
    };

    // Thử gọi backend để cập nhật vào Neo4j (không truyền id / createdAt / updatedAt)
    try {
      this.assertAccountContext(
        accountContext,
        'Tài khoản đã thay đổi trong lúc cập nhật node.'
      );
      const { id, createdAt, updatedAt, ...updatesForBackend } = effectiveUpdates;
      const res = await api.updateNode(nodeId, updatesForBackend);
      this.assertAccountContext(
        accountContext,
        'Tài khoản đã thay đổi trong lúc cập nhật node.'
      );
      if (!res.success && options.requireBackend) {
        throw new Error(res.message || 'Backend không xác nhận đã cập nhật node');
      }
      if (res.success && res.data) {
        Object.assign(updatedNode, res.data);
      }
    } catch (err) {
      this.assertAccountContext(
        accountContext,
        'Tài khoản đã thay đổi trong lúc cập nhật node.'
      );
      if (options.requireBackend || err instanceof ApiError) {
        throw err;
      }
      console.warn('[ProjectStore] Không thể cập nhật node lên Backend, cập nhật local:', err);
    }

    this.assertAccountContext(
      accountContext,
      'Tài khoản đã thay đổi trong lúc cập nhật node.'
    );
    project.nodes[index] = updatedNode;
    await this.saveProject(project, accountContext);

    return updatedNode;
  }

  /**
   * Xóa một Node khỏi Project
   */
  async deleteNode(projectId: string, nodeId: string): Promise<void> {
    const accountContext = this.captureAccountContext();
    const project = await this.getProject(projectId);
    this.assertAccountContext(
      accountContext,
      'Tài khoản đã thay đổi trong lúc xóa node.'
    );

    // Thử gọi backend để xóa trên Neo4j
    try {
      this.assertAccountContext(
        accountContext,
        'Tài khoản đã thay đổi trong lúc xóa node.'
      );
      await api.deleteNode(nodeId);
      this.assertAccountContext(
        accountContext,
        'Tài khoản đã thay đổi trong lúc xóa node.'
      );
    } catch (err) {
      this.assertAccountContext(
        accountContext,
        'Tài khoản đã thay đổi trong lúc xóa node.'
      );
      if (err instanceof ApiError) {
        throw err;
      }
      console.warn('[ProjectStore] Không thể xóa node trên Backend, xóa local:', err);
    }

    // Xóa node và các liên kết liên quan
    this.assertAccountContext(
      accountContext,
      'Tài khoản đã thay đổi trong lúc xóa node.'
    );
    project.nodes = project.nodes.filter((n) => n.id !== nodeId);
    project.links = project.links.filter((l) => l.source !== nodeId && l.target !== nodeId);
    project.edges = project.links;
    project.nodeCount = project.nodes.length;
    project.linkCount = project.links.length;

    await this.saveProject(project, accountContext);
  }

  /**
   * Tạo một Liên kết (Link) mới giữa 2 node trong Project
   */
  async createLink(projectId: string, linkData: Partial<StoryLink>): Promise<StoryLink> {
    const accountContext = this.captureAccountContext();
    const project = await this.getProject(projectId);
    this.assertAccountContext(
      accountContext,
      'Tài khoản đã thay đổi trong lúc tạo liên kết.'
    );
    const linkId = linkData.id && linkData.id.trim()
      ? linkData.id.trim()
      : `link-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    const newLink: StoryLink = {
      id: linkId,
      source: linkData.source || '',
      target: linkData.target || '',
      label: linkData.label || 'liên hệ',
      type: linkData.type || 'solid',
      category: linkData.category || '',
      contextNote: linkData.contextNote || '',
      tone: linkData.tone || 'loyalty',
    };

    // Thử gọi backend để lưu quan hệ vào Neo4j
    try {
      this.assertAccountContext(
        accountContext,
        'Tài khoản đã thay đổi trong lúc tạo liên kết.'
      );
      const res = await api.createLink({
        id: linkId,
        source: newLink.source,
        target: newLink.target,
        label: newLink.label,
        type: newLink.type,
        category: newLink.category,
        contextNote: newLink.contextNote,
        tone: newLink.tone,
      });
      this.assertAccountContext(
        accountContext,
        'Tài khoản đã thay đổi trong lúc tạo liên kết.'
      );
      if (res.success && res.data) {
        Object.assign(newLink, res.data);
      }
    } catch (err) {
      this.assertAccountContext(
        accountContext,
        'Tài khoản đã thay đổi trong lúc tạo liên kết.'
      );
      if (err instanceof ApiError) {
        throw err;
      }
      console.warn('[ProjectStore] Không thể lưu link lên Backend, lưu tạm local:', err);
    }

    this.assertAccountContext(
      accountContext,
      'Tài khoản đã thay đổi trong lúc tạo liên kết.'
    );
    project.links = [...project.links, newLink];
    project.edges = project.links;
    project.linkCount = project.links.length;
    await this.saveProject(project, accountContext);

    return newLink;
  }

  /**
   * Xóa một Liên kết (Link) khỏi Project
   */
  async deleteLink(projectId: string, linkId: string): Promise<void> {
    const accountContext = this.captureAccountContext();
    const project = await this.getProject(projectId);
    this.assertAccountContext(
      accountContext,
      'Tài khoản đã thay đổi trong lúc xóa liên kết.'
    );

    // Thử gọi backend để xóa quan hệ trên Neo4j
    try {
      this.assertAccountContext(
        accountContext,
        'Tài khoản đã thay đổi trong lúc xóa liên kết.'
      );
      await api.deleteLink(linkId);
      this.assertAccountContext(
        accountContext,
        'Tài khoản đã thay đổi trong lúc xóa liên kết.'
      );
    } catch (err) {
      this.assertAccountContext(
        accountContext,
        'Tài khoản đã thay đổi trong lúc xóa liên kết.'
      );
      if (err instanceof ApiError) {
        throw err;
      }
      console.warn('[ProjectStore] Không thể xóa link trên Backend, xóa local:', err);
    }

    this.assertAccountContext(
      accountContext,
      'Tài khoản đã thay đổi trong lúc xóa liên kết.'
    );
    project.links = project.links.filter((l) => l.id !== linkId);
    project.edges = project.links;
    project.linkCount = project.links.length;
    await this.saveProject(project, accountContext);
  }

  private async getLocalProjects(accountId: string | null): Promise<StoryProject[]> {
    const key = this.getLocalProjectsKey(accountId);
    if (!key) return [];

    try {
      const raw = await AsyncStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private async cacheProjectLocally(
    project: StoryProject,
    accountId: string | null
  ): Promise<void> {
    const key = this.getProjectCacheKey(project.id, accountId);
    if (!key) return;

    try {
      await AsyncStorage.setItem(key, JSON.stringify(project));
    } catch {}
  }

  private async getCachedProjectLocally(
    projectId: string,
    accountId: string | null
  ): Promise<StoryProject | null> {
    const key = this.getProjectCacheKey(projectId, accountId);
    if (!key || !accountId) return null;

    try {
      const raw = await AsyncStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch {
      return null;
    }

    try {
      // Legacy cache keys are unscoped; use them only when ownership is explicit.
      const legacyRaw = await AsyncStorage.getItem(`${PROJECT_CACHE_PREFIX}${projectId}`);
      if (!legacyRaw) return null;
      const legacyProject = JSON.parse(legacyRaw) as StoryProject;
      return legacyProject?.userId === accountId ? legacyProject : null;
    } catch {
      return null;
    }
  }

  /**
   * Lấy danh sách Chapter của một dự án
   */
  async getChapters(projectId: string): Promise<StoryChapter[]> {
    const accountId = this.accountId;
    const accountVersion = this.accountVersion;
    try {
      const res = await api.getChapters(projectId);
      if (this.accountVersion !== accountVersion) {
        throw new Error('Tài khoản đã thay đổi trong lúc tải chương.');
      }
      if (res.success && Array.isArray(res.data) && res.data.length > 0) {
        const locallyCachedProject =
          this.memoryProjects.get(projectId) ||
          (await this.getCachedProjectLocally(projectId, accountId));
        if (this.accountVersion !== accountVersion) {
          throw new Error('Tài khoản đã thay đổi trong lúc tải chương.');
        }
        const pendingChapters = (locallyCachedProject?.chapters || []).filter(
          (chapter) => chapter.syncStatus === 'pending'
        );
        return [
          ...(res.data as StoryChapter[]),
          ...pendingChapters.filter(
            (pending) => !res.data.some((chapter) => chapter.id === pending.id)
          ),
        ];
      }
    } catch {
      if (this.accountVersion !== accountVersion) {
        throw new Error('Tài khoản đã thay đổi trong lúc tải chương.');
      }
    }
    const project = await this.getProject(projectId);
    return project.chapters || [];
  }

  /**
   * Tạo Chapter mới trong Project
   */
  async createChapter(
    projectId: string,
    chapterData: {
      chapterNumber?: number;
      title: string;
      desc?: string;
      content?: string;
      events?: any[];
    }
  ): Promise<StoryChapter> {
    const accountContext = this.captureAccountContext();
    const project = await this.getProject(projectId);
    this.assertAccountContext(
      accountContext,
      'Tài khoản đã thay đổi trong lúc tạo chương.'
    );
    const existingChapters = project.chapters || [];
    const num = chapterData.chapterNumber || existingChapters.length + 1;
    const newChapter: StoryChapter = {
      id: `c-${num}-${Date.now().toString(36)}`,
      chapterNumber: num,
      code: `C${num}`,
      title: chapterData.title.trim(),
      shortTitle: `C${num} ${chapterData.title.trim()}`,
      watermark: chapterData.title.trim().toUpperCase(),
      desc: chapterData.desc?.trim() || '',
      content: chapterData.content?.trim() || '',
      events: chapterData.events || [],
      nodes: [],
      links: [],
      syncStatus: 'pending',
    };

    for (const event of newChapter.events) {
      if (!event || typeof event.id !== 'string') {
        throw new Error('Dữ liệu sự kiện của chương mới không hợp lệ');
      }
      const eventNode = project.nodes.find((node) => node.id === event.id);
      if (!eventNode || !eventBelongsToChapter(eventNode, newChapter)) {
        throw new Error(
          `Sự kiện ${event.id} không thuộc chương mới theo nhãn chương của node`
        );
      }
    }

    try {
      this.assertAccountContext(
        accountContext,
        'Tài khoản đã thay đổi trong lúc tạo chương.'
      );
      const res = await api.createChapter(projectId, {
        id: newChapter.id,
        chapterNumber: num,
        title: newChapter.title,
        desc: newChapter.desc,
        content: newChapter.content,
        events: newChapter.events,
      });
      this.assertAccountContext(
        accountContext,
        'Tài khoản đã thay đổi trong lúc tạo chương.'
      );
      if (!res.success || !res.data) {
        throw new Error(res.message || 'Backend không xác nhận đã tạo chương');
      }
      Object.assign(newChapter, res.data, { syncStatus: 'synced' });
    } catch (err) {
      this.assertAccountContext(
        accountContext,
        'Tài khoản đã thay đổi trong lúc tạo chương.'
      );
      console.warn('[ProjectStore] Không thể tạo chapter lên Backend, lưu local:', err);
    }

    this.assertAccountContext(
      accountContext,
      'Tài khoản đã thay đổi trong lúc tạo chương.'
    );
    project.chapters = [...existingChapters, newChapter];
    await this.saveProject(project, accountContext);
    return newChapter;
  }

  async ensureChapterSynced(projectId: string, chapterId: string): Promise<StoryChapter> {
    const accountContext = this.captureAccountContext();
    const project = await this.getProject(projectId);
    this.assertAccountContext(
      accountContext,
      'Tài khoản đã thay đổi trong lúc đồng bộ chương.'
    );
    const chapters = project.chapters;
    if (!chapters) {
      throw new Error(`Không tìm thấy chương với ID: ${chapterId}`);
    }
    const chapterIndex = chapters.findIndex((item) => item.id === chapterId);
    if (chapterIndex === -1) {
      throw new Error(`Không tìm thấy chương với ID: ${chapterId}`);
    }

    const chapter = chapters[chapterIndex];
    if (!chapter) {
      throw new Error(`Không tìm thấy chương với ID: ${chapterId}`);
    }
    if (chapter.syncStatus !== 'pending') return chapter;

    let remoteChapter: StoryChapter | undefined;
    let createError: unknown;
    try {
      this.assertAccountContext(
        accountContext,
        'Tài khoản đã thay đổi trong lúc đồng bộ chương.'
      );
      const response = await api.createChapter(projectId, {
        id: chapter.id,
        chapterNumber: chapter.chapterNumber,
        title: chapter.title,
        desc: chapter.desc,
        content: chapter.content,
        events: chapter.events,
      });
      this.assertAccountContext(
        accountContext,
        'Tài khoản đã thay đổi trong lúc đồng bộ chương.'
      );
      if (!response.success || !response.data) {
        throw new Error(response.message || 'Backend không xác nhận đã đồng bộ chương');
      }
      remoteChapter = response.data as StoryChapter;
    } catch (err) {
      this.assertAccountContext(
        accountContext,
        'Tài khoản đã thay đổi trong lúc đồng bộ chương.'
      );
      createError = err;
    }

    if (!remoteChapter) {
      try {
        this.assertAccountContext(
          accountContext,
          'Tài khoản đã thay đổi trong lúc đồng bộ chương.'
        );
        const response = await api.getChapters(projectId);
        this.assertAccountContext(
          accountContext,
          'Tài khoản đã thay đổi trong lúc đồng bộ chương.'
        );
        remoteChapter = response.data.find((item) => item.id === chapter.id) as
          | StoryChapter
          | undefined;
      } catch (verifyError) {
        this.assertAccountContext(
          accountContext,
          'Tài khoản đã thay đổi trong lúc đồng bộ chương.'
        );
        const createMessage =
          createError instanceof Error ? createError.message : String(createError);
        const verifyMessage =
          verifyError instanceof Error ? verifyError.message : String(verifyError);
        throw new Error(
          `Không thể đồng bộ chương: ${createMessage}. Không xác minh được trạng thái trên máy chủ: ${verifyMessage}`
        );
      }
    }

    if (!remoteChapter) {
      if (createError instanceof Error) throw createError;
      throw new Error('Backend chưa tạo được chương.');
    }

    this.assertAccountContext(
      accountContext,
      'Tài khoản đã thay đổi trong lúc đồng bộ chương.'
    );
    const latestProject = await this.getProject(projectId, { preferCache: true });
    this.assertAccountContext(
      accountContext,
      'Tài khoản đã thay đổi trong lúc đồng bộ chương.'
    );
    const latestChapters = latestProject.chapters || [];
    const latestChapterIndex = latestChapters.findIndex((item) => item.id === chapterId);
    if (latestChapterIndex === -1) {
      throw new Error(`Chương ${chapterId} đã bị xóa trong lúc đồng bộ`);
    }
    const latestChapter = latestChapters[latestChapterIndex];
    const syncedChapter = {
      ...remoteChapter,
      ...latestChapter,
      syncStatus: 'synced' as const,
    };
    latestChapters[latestChapterIndex] = syncedChapter;
    latestProject.chapters = latestChapters;
    await this.saveProject(latestProject, accountContext);
    return syncedChapter;
  }

  /**
   * Cập nhật nội dung văn bản câu chuyện của Chapter
   */
  async updateChapterStoryContent(
    projectId: string,
    chapterId: string,
    content: string
  ): Promise<void> {
    const accountContext = this.captureAccountContext();
    await this.ensureChapterSynced(projectId, chapterId);
    this.assertAccountContext(
      accountContext,
      'Tài khoản đã thay đổi trong lúc cập nhật chương.'
    );
    const project = await this.getProject(projectId);
    this.assertAccountContext(
      accountContext,
      'Tài khoản đã thay đổi trong lúc cập nhật chương.'
    );
    const chapters = project.chapters || [];
    const chIdx = chapters.findIndex((c) => c.id === chapterId);
    if (chIdx === -1) {
      throw new Error(`Không tìm thấy chương với ID: ${chapterId}`);
    }

    this.assertAccountContext(
      accountContext,
      'Tài khoản đã thay đổi trong lúc cập nhật chương.'
    );
    await api.updateChapter(chapterId, { content });
    this.assertAccountContext(
      accountContext,
      'Tài khoản đã thay đổi trong lúc cập nhật chương.'
    );
    chapters[chIdx] = { ...chapters[chIdx], content };
    await this.saveProject(project, accountContext);
  }

  /**
   * Gán Node sự kiện vào Chapter (chỉ node sự kiện type === 'event' mới được gán)
   */
  async assignEventToChapter(
    projectId: string,
    chapterId: string,
    eventNode: StoryNode
  ): Promise<void> {
    return this.withSerializedChapterMutations(projectId, () =>
      this.assignEventToChapterLocked(projectId, chapterId, eventNode)
    );
  }

  private async assignEventToChapterLocked(
    projectId: string,
    chapterId: string,
    eventNode: StoryNode
  ): Promise<void> {
    if (eventNode.type !== 'event') {
      throw new Error('Chỉ node có phân loại là Sự kiện mới được gán vào chương');
    }

    if (eventNode.syncStatus === 'pending') {
      eventNode = await this.ensureNodeSynced(projectId, eventNode.id);
    }
    await this.ensureChapterSynced(projectId, chapterId);
    const project = await this.getProject(projectId);
    const chapter = (project.chapters || []).find((item) => item.id === chapterId);
    const currentEventNode = project.nodes.find((node) => node.id === eventNode.id);
    if (!chapter) {
      throw new Error(`Không tìm thấy chương với ID: ${chapterId}`);
    }
    if (!currentEventNode) {
      throw new Error(`Không tìm thấy node sự kiện với ID: ${eventNode.id}`);
    }

    const previousChapters = (project.chapters || []).filter(
      (item) =>
        item.id !== chapterId &&
        (eventBelongsToChapter(eventNode, item) ||
          item.events?.some((event) => event.id === eventNode.id))
    );
    const chapterEventUpdates: Array<{
      chapterId: string;
      events: StoryChapter['events'];
      previousEvents: StoryChapter['events'];
    }> = [];
    for (const previousChapter of previousChapters) {
      const previousEvents = previousChapter.events || [];
      const updatedEvents = previousEvents.filter(
        (event) => event.id !== eventNode.id
      );
      if (updatedEvents.length !== previousEvents.length) {
        chapterEventUpdates.push({
          chapterId: previousChapter.id,
          events: updatedEvents,
          previousEvents,
        });
      }
    }

    const targetChapter = chapter;
    const previousTargetEvents = targetChapter.events || [];
    const updatedEvents = [
      ...previousTargetEvents.filter((event) => event.id !== eventNode.id),
      { id: eventNode.id, title: eventNode.name, desc: eventNode.desc },
    ];
    chapterEventUpdates.push({
      chapterId,
      events: updatedEvents,
      previousEvents: previousTargetEvents,
    });

    const attemptedChapterUpdates: string[] = [];
    let nodeUpdateAttempted = false;
    try {
      nodeUpdateAttempted = true;
      await this.updateNode(
        projectId,
        eventNode.id,
        { chapter: targetChapter.id },
        { requireBackend: true }
      );
      for (const update of chapterEventUpdates) {
        attemptedChapterUpdates.push(update.chapterId);
        await this.persistChapterEvents(projectId, update.chapterId, update.events);
      }
    } catch (err) {
      const rollbackErrors: string[] = [];
      if (nodeUpdateAttempted) {
        try {
          await this.updateNode(
            projectId,
            eventNode.id,
            { chapter: currentEventNode.chapter || '' },
            { requireBackend: true }
          );
        } catch (rollbackErr) {
          rollbackErrors.push(
            rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)
          );
        }
      }
      for (const chapterId of attemptedChapterUpdates.reverse()) {
        const snapshot = chapterEventUpdates.find((item) => item.chapterId === chapterId);
        if (!snapshot) continue;
        try {
          await this.persistChapterEvents(projectId, chapterId, snapshot.previousEvents);
        } catch (rollbackErr) {
          rollbackErrors.push(
            rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)
          );
        }
      }
      if (rollbackErrors.length > 0) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`${message}; rollback failed: ${rollbackErrors.join('; ')}`);
      }
      throw err;
    }
  }

  private async persistChapterEvents(
    projectId: string,
    chapterId: string,
    events: StoryChapter['events']
  ): Promise<void> {
    const accountContext = this.captureAccountContext();
    await this.ensureChapterSynced(projectId, chapterId);
    this.assertAccountContext(
      accountContext,
      'Tài khoản đã thay đổi trong lúc cập nhật sự kiện chương.'
    );
    const response = await api.updateChapter(chapterId, { events });
    this.assertAccountContext(
      accountContext,
      'Tài khoản đã thay đổi trong lúc cập nhật sự kiện chương.'
    );
    if (!response.success) {
      throw new Error(response.message || 'Không thể cập nhật danh sách sự kiện của chương');
    }

    const project = await this.getProject(projectId);
    this.assertAccountContext(
      accountContext,
      'Tài khoản đã thay đổi trong lúc cập nhật sự kiện chương.'
    );
    const chapterIndex = (project.chapters || []).findIndex(
      (chapter) => chapter.id === chapterId
    );
    if (chapterIndex === -1 || !project.chapters) {
      throw new Error(`Không tìm thấy chương với ID: ${chapterId}`);
    }
    project.chapters[chapterIndex] = { ...project.chapters[chapterIndex], events };
    await this.saveProject(project, accountContext);
  }

  async removeEventFromChapter(
    projectId: string,
    chapterId: string,
    eventId: string,
    deleteEvent: boolean
  ): Promise<void> {
    return this.withSerializedChapterMutations(projectId, () =>
      this.removeEventFromChapterLocked(projectId, chapterId, eventId, deleteEvent)
    );
  }

  private async removeEventFromChapterLocked(
    projectId: string,
    chapterId: string,
    eventId: string,
    deleteEvent: boolean
  ): Promise<void> {
    await this.ensureChapterSynced(projectId, chapterId);
    const project = await this.getProject(projectId);
    const chapter = (project.chapters || []).find((item) => item.id === chapterId);
    if (!chapter) {
      throw new Error('Không tìm thấy chương cần chỉnh sửa');
    }

    const updatedEvents = (chapter.events || []).filter((event) => event.id !== eventId);
    const eventNode = (project.nodes || []).find(
      (node) => node.id === eventId && node.type === 'event'
    );
    const previousEvents = chapter.events || [];
    const replacementChapter =
      eventNode && eventBelongsToChapter(eventNode, chapter)
        ? getReplacementChapter(project, chapterId, eventNode)
        : undefined;
    const chapterUpdates: Array<{
      chapterId: string;
      events: StoryChapter['events'];
      previousEvents: StoryChapter['events'];
    }> = [];
    if (updatedEvents.length !== previousEvents.length) {
      chapterUpdates.push({ chapterId, events: updatedEvents, previousEvents });
    }

    if (replacementChapter && eventNode) {
      const replacementEvents = replacementChapter.events || [];
      if (!replacementEvents.some((event) => event.id === eventId)) {
        chapterUpdates.push({
          chapterId: replacementChapter.id,
          events: [
            ...replacementEvents,
            { id: eventNode.id, title: eventNode.name, desc: eventNode.desc },
          ],
          previousEvents: replacementEvents,
        });
      }
    }

    const attemptedChapterUpdates: string[] = [];
    let nodeUpdateAttempted = false;
    try {
      if (deleteEvent) {
        for (const update of chapterUpdates) {
          attemptedChapterUpdates.push(update.chapterId);
          await this.persistChapterEvents(projectId, update.chapterId, update.events);
        }
        if (eventNode) await this.deleteNode(projectId, eventId);
      } else {
        if (eventNode && eventBelongsToChapter(eventNode, chapter)) {
          nodeUpdateAttempted = true;
          await this.updateNode(projectId, eventId, {
            chapter: replacementChapter?.id || '',
          });
        }
        for (const update of chapterUpdates) {
          attemptedChapterUpdates.push(update.chapterId);
          await this.persistChapterEvents(projectId, update.chapterId, update.events);
        }
      }
    } catch (err) {
      const rollbackErrors: string[] = [];
      if (!deleteEvent && nodeUpdateAttempted && eventNode) {
        try {
          await this.updateNode(projectId, eventId, {
            chapter: eventNode.chapter || '',
          });
        } catch (rollbackErr) {
          rollbackErrors.push(
            rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)
          );
        }
      }
      for (const attemptedChapterId of attemptedChapterUpdates.reverse()) {
        const snapshot = chapterUpdates.find(
          (update) => update.chapterId === attemptedChapterId
        );
        if (!snapshot) continue;
        try {
          await this.persistChapterEvents(
            projectId,
            attemptedChapterId,
            snapshot.previousEvents
          );
        } catch (rollbackErr) {
          rollbackErrors.push(
            rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)
          );
        }
      }
      if (rollbackErrors.length > 0) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`${message}; rollback failed: ${rollbackErrors.join('; ')}`);
      }
      throw err;
    }
  }

  async deleteChapter(
    projectId: string,
    chapterId: string,
    deleteEvents: boolean
  ): Promise<void> {
    return this.withSerializedChapterMutations(projectId, () =>
      this.deleteChapterLocked(projectId, chapterId, deleteEvents)
    );
  }

  private async deleteChapterLocked(
    projectId: string,
    chapterId: string,
    deleteEvents: boolean
  ): Promise<void> {
    await this.ensureChapterSynced(projectId, chapterId);
    const project = await this.getProject(projectId);
    const chapter = (project.chapters || []).find((item) => item.id === chapterId);
    if (!chapter) {
      throw new Error('Không tìm thấy chương cần xóa');
    }

    const eventNodes = getEventNodesForChapter(project, chapter);
    if (deleteEvents) {
      for (const eventNode of eventNodes) {
        await this.deleteNode(projectId, eventNode.id);
      }
    } else {
      for (const eventNode of eventNodes) {
        if (eventBelongsToChapter(eventNode, chapter)) {
          const replacementChapter = getReplacementChapter(project, chapterId, eventNode);
          await this.updateNode(projectId, eventNode.id, {
            chapter: replacementChapter?.id || '',
          });
        }
      }
    }

    try {
      await api.deleteChapter(chapterId);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      console.warn('[ProjectStore] Không thể xóa chương trên Backend, xóa local:', err);
    }

    const updatedProject = await this.getProject(projectId);
    updatedProject.chapters = (updatedProject.chapters || []).filter(
      (item) => item.id !== chapterId
    );
    await this.saveProject(updatedProject);
  }
}

export const projectStore = new ProjectStore();
