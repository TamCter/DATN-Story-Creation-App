import AsyncStorage from '@react-native-async-storage/async-storage';
import { INITIAL_PROJECTS, StoryChapter, StoryLink, StoryNode, StoryProject } from '@/constants/story-data';
import { api } from '@/services/api';

const CUSTOM_PROJECTS_KEY = '@story_app_custom_projects';
const PROJECT_CACHE_PREFIX = '@story_app_project_cache_';

export class ProjectStore {
  private memoryProjects: Map<string, StoryProject> = new Map();

  constructor() {
    // Nạp sẵn INITIAL_PROJECTS vào memory
    for (const p of INITIAL_PROJECTS) {
      this.memoryProjects.set(p.id, { ...p });
    }
  }

  /**
   * Lấy toàn bộ danh sách dự án
   */
  async getProjects(userId?: string): Promise<StoryProject[]> {
    try {
      const res = await api.getProjects();
      if (res.success && Array.isArray(res.data) && res.data.length > 0) {
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

    const localProjects = await this.getLocalProjects();
    if (localProjects.length > 0) {
      return localProjects;
    }

    if (userId === 'user-guest-demo') {
      return INITIAL_PROJECTS;
    }

    return [];
  }

  /**
   * Lấy thông tin chi tiết dự án kèm Nodes và Links của dự án đó.
   * QUAN TRỌNG: Không bao giờ fallback sang dự án khác nếu không tìm thấy!
   */
  async getProject(projectId: string): Promise<StoryProject> {
    // 1. Thử gọi API Backend để lấy dữ liệu mới nhất từ Neo4j
    try {
      const res = await api.getProjectGraph(projectId);
      if (res.success && res.data) {
        const { project, nodes = [], links = [] } = res.data;
        const fullProject: StoryProject = {
          ...project,
          nodeCount: nodes.length,
          linkCount: links.length,
          nodes: nodes as StoryNode[],
          links: links as StoryLink[],
        };
        this.memoryProjects.set(projectId, fullProject);
        await this.cacheProjectLocally(fullProject);
        return fullProject;
      }
    } catch {
      // Bỏ qua lỗi mạng, chuyển sang lấy từ cache / local storage
    }

    // 2. Kiểm tra bộ nhớ tạm (Memory Cache)
    if (this.memoryProjects.has(projectId)) {
      const proj = this.memoryProjects.get(projectId)!;
      // Đảm bảo không dính nodes của dự án khác
      return { ...proj, nodes: [...proj.nodes], links: [...proj.links] };
    }

    // 3. Kiểm tra Local Storage (AsyncStorage)
    const cached = await this.getCachedProjectLocally(projectId);
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
  async saveProject(project: StoryProject): Promise<void> {
    this.memoryProjects.set(project.id, { ...project });
    await this.cacheProjectLocally(project);

    // Cập nhật danh sách local projects
    const locals = await this.getLocalProjects();
    const idx = locals.findIndex((p) => p.id === project.id);
    if (idx >= 0) {
      locals[idx] = { ...locals[idx], ...project };
    } else {
      locals.unshift(project);
    }
    await AsyncStorage.setItem(CUSTOM_PROJECTS_KEY, JSON.stringify(locals));
  }

  /**
   * Tạo một Node mới trong Project
   */
  async createNode(projectId: string, nodeData: Partial<StoryNode>): Promise<StoryNode> {
    const project = await this.getProject(projectId);
    const type = nodeData.type || 'character';
    const cleanPrefix = type.slice(0, 4);
    const generatedId = nodeData.id && nodeData.id.trim()
      ? nodeData.id.trim()
      : `${cleanPrefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

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
      impact: nodeData.impact?.trim() || '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Thử gọi backend để lưu vào Neo4j (không truyền createdAt / updatedAt thủ công)
    try {
      const { createdAt, updatedAt, ...payloadForBackend } = newNode;
      const res = await api.createNode(projectId, payloadForBackend);
      if (res.success && res.data) {
        Object.assign(newNode, res.data);
      }
    } catch (err) {
      console.warn('[ProjectStore] Không thể lưu node lên Backend, lưu tạm local:', err);
    }

    // Cập nhật bộ nhớ và local cache
    project.nodes = [...project.nodes, newNode];
    project.nodeCount = project.nodes.length;
    await this.saveProject(project);

    return newNode;
  }

  /**
   * Cập nhật thông tin của một Node
   */
  async updateNode(projectId: string, nodeId: string, updates: Partial<StoryNode>): Promise<StoryNode> {
    const project = await this.getProject(projectId);
    const index = project.nodes.findIndex((n) => n.id === nodeId);
    if (index === -1) {
      throw new Error(`Không tìm thấy node với ID: ${nodeId} trong dự án`);
    }

    const updatedNode: StoryNode = {
      ...project.nodes[index],
      ...updates,
      updatedAt: Date.now(),
    };

    // Thử gọi backend để cập nhật vào Neo4j (không truyền id / createdAt / updatedAt)
    try {
      const { id, createdAt, updatedAt, ...updatesForBackend } = updates;
      const res = await api.updateNode(nodeId, updatesForBackend);
      if (res.success && res.data) {
        Object.assign(updatedNode, res.data);
      }
    } catch (err) {
      console.warn('[ProjectStore] Không thể cập nhật node lên Backend, cập nhật local:', err);
    }

    project.nodes[index] = updatedNode;
    await this.saveProject(project);

    return updatedNode;
  }

  /**
   * Xóa một Node khỏi Project
   */
  async deleteNode(projectId: string, nodeId: string): Promise<void> {
    const project = await this.getProject(projectId);

    // Thử gọi backend để xóa trên Neo4j
    try {
      await api.deleteNode(nodeId);
    } catch (err) {
      console.warn('[ProjectStore] Không thể xóa node trên Backend, xóa local:', err);
    }

    // Xóa node và các liên kết liên quan
    project.nodes = project.nodes.filter((n) => n.id !== nodeId);
    project.links = project.links.filter((l) => l.source !== nodeId && l.target !== nodeId);
    project.nodeCount = project.nodes.length;
    project.linkCount = project.links.length;

    await this.saveProject(project);
  }

  private async getLocalProjects(): Promise<StoryProject[]> {
    try {
      const raw = await AsyncStorage.getItem(CUSTOM_PROJECTS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private async cacheProjectLocally(project: StoryProject): Promise<void> {
    try {
      await AsyncStorage.setItem(
        `${PROJECT_CACHE_PREFIX}${project.id}`,
        JSON.stringify(project)
      );
    } catch {}
  }

  private async getCachedProjectLocally(projectId: string): Promise<StoryProject | null> {
    try {
      const raw = await AsyncStorage.getItem(`${PROJECT_CACHE_PREFIX}${projectId}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}

export const projectStore = new ProjectStore();
