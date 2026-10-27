import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  CHARACTER_PROFESSIONS,
  CHARACTER_STATUS_OPTIONS,
  FACTION_CLASSIFICATIONS,
  FACTION_STATUS_OPTIONS,
  GENDER_OPTIONS,
  generateUniqueNodeId,
  getProjectChapters,
  INITIAL_PROJECTS,
  ITEM_RARITY_OPTIONS,
  LOCATION_CLIMATE_OPTIONS,
  LOCATION_DANGER_OPTIONS,
  LOCATION_REGION_OPTIONS,
  NODE_TYPE_CONFIG,
  StoryNode,
  StoryProject,
} from '@/constants/story-data';
import { AppFonts, ThemeColors } from '@/constants/theme';
import { projectStore } from '@/services/project-store';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { FormSelectField } from '@/components/ui/FormSelectField';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function NodesDetailScreen() {
  const params = useLocalSearchParams();
  const projectId = (params.projectId as string) || 'project-1';
  const initialType = (params.type as string) || 'all';

  const [currentProject, setCurrentProject] = useState<StoryProject>(() => {
    const match = INITIAL_PROJECTS.find((p) => p.id === projectId);
    return (
      match || {
        id: projectId,
        title: 'Đang tải...',
        genre: '',
        number: '№ 01',
        nodeCount: 0,
        linkCount: 0,
        updatedAt: 'Vừa xong',
        nodes: [],
        links: [],
      }
    );
  });

  const [nodes, setNodes] = useState<StoryNode[]>(currentProject.nodes || []);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<string>(initialType);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form Fields
  const [formId, setFormId] = useState('');
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<StoryNode['type']>('character');
  const [formRole, setFormRole] = useState('CHÍNH DIỆN');
  const [formSubType, setFormSubType] = useState('');
  const [formStatus, setFormStatus] = useState('Còn sống');
  const [formDesc, setFormDesc] = useState('');

  // Specific fields
  const [formDob, setFormDob] = useState('');
  const [formBirthplace, setFormBirthplace] = useState('');
  const [formGender, setFormGender] = useState('Nam');
  const [formWeapon, setFormWeapon] = useState('');
  const [formSect, setFormSect] = useState('');
  const [formPersonality, setFormPersonality] = useState('');

  // Available node categories for relation selections
  const characterNodes = useMemo(() => nodes.filter((n) => n.type === 'character'), [nodes]);
  const itemNodes = useMemo(() => nodes.filter((n) => n.type === 'item'), [nodes]);
  const factionNodes = useMemo(() => nodes.filter((n) => n.type === 'faction'), [nodes]);
  const locationNodes = useMemo(() => nodes.filter((n) => n.type === 'location'), [nodes]);
  const eventNodes = useMemo(() => nodes.filter((n) => n.type === 'event'), [nodes]);
  const chapters = useMemo(() => getProjectChapters(currentProject), [currentProject]);

  const [formStatusEvent, setFormStatusEvent] = useState('');

  const [formRarity, setFormRarity] = useState('Quý hiếm');
  const [formOrigin, setFormOrigin] = useState('');
  const [formElement, setFormElement] = useState('');
  const [formPower, setFormPower] = useState('');
  const [formHolder, setFormHolder] = useState('');

  const [formRegion, setFormRegion] = useState('Đông Vực');
  const [formTerrain, setFormTerrain] = useState('');
  const [formDangerLevel, setFormDangerLevel] = useState('Tuyệt đối an toàn');
  const [formClimate, setFormClimate] = useState('Ôn hòa');
  const [formRuler, setFormRuler] = useState('');

  const [formLeader, setFormLeader] = useState('');
  const [formHeadquarters, setFormHeadquarters] = useState('');
  const [formMotto, setFormMotto] = useState('');
  const [formAlignment, setFormAlignment] = useState<string>('CHÍNH PHÁI');

  const [formChapter, setFormChapter] = useState('');
  const [formTime, setFormTime] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formImpact, setFormImpact] = useState('');

  // Load project from store
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setIsLoading(true);
      try {
        const proj = await projectStore.getProject(projectId);
        if (isMounted) {
          setCurrentProject(proj);
          setNodes(proj.nodes || []);
        }
      } catch (err) {
        console.warn('Lỗi tải danh sách node:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    void loadData();
    return () => {
      isMounted = false;
    };
  }, [projectId]);

  const filteredNodes = useMemo(() => {
    return nodes.filter((node) => {
      if (selectedType !== 'all' && node.type !== selectedType) {
        return false;
      }
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      return (
        node.name.toLowerCase().includes(q) ||
        node.desc.toLowerCase().includes(q) ||
        node.role.toLowerCase().includes(q)
      );
    });
  }, [nodes, selectedType, searchQuery]);

  const handleOpenAddModal = (defaultType: StoryNode['type'] = 'character') => {
    setIsEditing(false);
    setEditingNodeId(null);
    setFormId(generateUniqueNodeId(defaultType, nodes));
    setFormName('');
    setFormType(defaultType);
    setFormRole(defaultType === 'character' ? 'CHÍNH DIỆN' : defaultType === 'event' ? 'BIẾN CỐ' : '');
    setFormSubType(
      defaultType === 'character'
        ? 'Kiếm khách / Đao khách'
        : defaultType === 'faction'
        ? 'Chính phái'
        : ''
    );
    setFormStatus(
      defaultType === 'character'
        ? 'Còn sống'
        : defaultType === 'faction'
        ? 'Hưng thịnh'
        : defaultType === 'event'
        ? 'Đã diễn ra'
        : 'Hoạt động'
    );
    setFormStatusEvent('');
    setFormDesc('');
    setFormDob('');
    setFormBirthplace('');
    setFormGender('Nam');
    setFormWeapon('');
    setFormSect('');
    setFormPersonality('');
    setFormRarity('Quý hiếm');
    setFormOrigin('');
    setFormElement('');
    setFormPower('');
    setFormHolder('');
    setFormRegion('Đông Vực');
    setFormTerrain('');
    setFormDangerLevel('Tuyệt đối an toàn');
    setFormClimate('Ôn hòa');
    setFormRuler('');
    setFormLeader('');
    setFormHeadquarters('');
    setFormMotto('');
    setFormAlignment('CHÍNH PHÁI');
    setFormChapter(chapters[0]?.title || '');
    setFormTime(chapters[0]?.title || '');
    setFormLocation('');
    setFormImpact('');
    setModalOpen(true);
  };

  const handleOpenEditModal = (node: StoryNode) => {
    setIsEditing(true);
    setEditingNodeId(node.id);
    setFormId(node.id);
    setFormName(node.name || '');
    setFormType(node.type || 'character');
    setFormRole(node.role || '');
    setFormSubType(node.subType || (node.type === 'faction' ? 'Chính phái' : ''));
    setFormStatus(node.status || (node.type === 'character' ? 'Còn sống' : node.type === 'faction' ? 'Hưng thịnh' : 'Hoạt động'));
    setFormStatusEvent(node.statusEvent || '');
    setFormDesc(node.desc || '');
    setFormDob(node.dob || '');
    setFormBirthplace(node.birthplace || '');
    setFormGender(node.gender || 'Nam');
    setFormWeapon(node.weapon || '');
    setFormSect(node.sect || '');
    setFormPersonality(node.personality || '');
    setFormRarity(node.rarity || 'Quý hiếm');
    setFormOrigin(node.origin || '');
    setFormElement(node.element || '');
    setFormPower(node.power || '');
    setFormHolder(node.holderOrLocation || '');
    setFormRegion(node.region || 'Đông Vực');
    setFormTerrain(node.terrain || '');
    setFormDangerLevel(node.dangerLevel || 'Tuyệt đối an toàn');
    setFormClimate(node.climate || 'Ôn hòa');
    setFormRuler(node.ruler || '');
    setFormLeader(node.leader || '');
    setFormHeadquarters(node.headquarters || '');
    setFormMotto(node.motto || '');
    setFormAlignment(node.alignment || 'CHÍNH PHÁI');
    setFormChapter(node.chapter || node.time || '');
    setFormTime(node.time || node.chapter || '');
    setFormLocation(node.location || '');
    setFormImpact(node.impact || '');
    setModalOpen(true);
  };

  const handleSaveNode = async () => {
    if (!formName.trim()) {
      if (Platform.OS === 'web') {
        window.alert('Vui lòng nhập tên cho thực thể');
      } else {
        Alert.alert('Thiếu thông tin', 'Vui lòng nhập tên cho thực thể');
      }
      return;
    }

    setIsSubmitting(true);
    const payload: Partial<StoryNode> = {
      name: formName.trim(),
      type: formType,
      desc: formDesc.trim(),
    };

    if (formId.trim()) payload.id = formId.trim();

    if (formType === 'character') {
      payload.role = formRole.trim();
      payload.subType = formSubType.trim();
      payload.status = formStatus.trim() || 'Còn sống';
      if ((formStatus === 'Đã chết' || formStatus === 'Hồi sinh') && formStatusEvent.trim()) {
        payload.statusEvent = formStatusEvent.trim();
      }
      if (formDob.trim()) payload.dob = formDob.trim();
      if (formBirthplace.trim()) payload.birthplace = formBirthplace.trim();
      if (formGender.trim()) payload.gender = formGender.trim();
      if (formWeapon.trim()) payload.weapon = formWeapon.trim();
      if (formSect.trim()) payload.sect = formSect.trim();
      if (formPersonality.trim()) payload.personality = formPersonality.trim();
    } else if (formType === 'item') {
      payload.role = '';
      payload.subType = '';
      payload.status = 'Nguyên vẹn';
      payload.rarity = formRarity.trim() || 'Quý hiếm';
      if (formOrigin.trim()) payload.origin = formOrigin.trim();
      if (formHolder.trim()) payload.holderOrLocation = formHolder.trim();
      if (formElement.trim()) payload.element = formElement.trim();
    } else if (formType === 'location') {
      payload.role = '';
      payload.subType = '';
      payload.status = 'Hoạt động';
      payload.region = formRegion.trim() || 'Đông Vực';
      payload.dangerLevel = formDangerLevel.trim() || 'Tuyệt đối an toàn';
      payload.climate = formClimate.trim() || 'Ôn hòa';
      if (formRuler.trim()) payload.ruler = formRuler.trim();
    } else if (formType === 'faction') {
      payload.role = '';
      payload.subType = formSubType.trim() || 'Chính phái';
      payload.status = formStatus.trim() || 'Hưng thịnh';
      if (formStatus === 'Suy tàn' && formStatusEvent.trim()) {
        payload.statusEvent = formStatusEvent.trim();
      }
      if (formLeader.trim()) payload.leader = formLeader.trim();
      if (formHeadquarters.trim()) payload.headquarters = formHeadquarters.trim();
      if (formMotto.trim()) payload.motto = formMotto.trim();
    } else if (formType === 'event') {
      payload.role = formRole.trim() || 'BIẾN CỐ';
      payload.subType = formSubType.trim();
      payload.status = formStatus.trim() || 'Đã diễn ra';
      const chVal = formChapter.trim() || formTime.trim();
      if (chVal) {
        payload.chapter = chVal;
        payload.time = chVal;
      }
      if (formLocation.trim()) payload.location = formLocation.trim();
    }

    try {
      if (isEditing && editingNodeId) {
        const updated = await projectStore.updateNode(currentProject.id, editingNodeId, payload);
        setNodes((prev) => prev.map((n) => (n.id === editingNodeId ? { ...n, ...updated } : n)));
      } else {
        const created = await projectStore.createNode(currentProject.id, payload);
        setNodes((prev) => [...prev, created]);
      }
      setModalOpen(false);
    } catch (err: any) {
      const msg = err.message || 'Không thể lưu node';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Lỗi', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteNode = (node: StoryNode) => {
    const doDelete = async () => {
      try {
        await projectStore.deleteNode(currentProject.id, node.id);
        setNodes((prev) => prev.filter((n) => n.id !== node.id));
      } catch (err: any) {
        const msg = err.message || 'Không thể xóa node';
        if (Platform.OS === 'web') window.alert(msg);
        else Alert.alert('Lỗi', msg);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Bạn có chắc muốn xóa node "${node.name}" và toàn bộ liên kết liên quan?`)) {
        void doDelete();
      }
    } else {
      Alert.alert(
        'Xác nhận xóa',
        `Bạn có chắc muốn xóa node "${node.name}" và toàn bộ liên kết liên quan?`,
        [
          { text: 'Hủy', style: 'cancel' },
          { text: 'Xóa vĩnh viễn', style: 'destructive', onPress: () => void doDelete() },
        ]
      );
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Header */}
      <View style={styles.headerBar}>
        <View style={styles.headerLeftGroup}>
          <Pressable
            hitSlop={12}
            style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
            onPress={() => router.back()}>
            <Text style={styles.backBtnIcon}>‹</Text>
          </Pressable>
          <View>
            <Text style={styles.headerTitle}>Chi tiết node</Text>
            <Text style={styles.headerSubtitle}>
              {currentProject.title} · {nodes.length} THỰC THỂ
            </Text>
          </View>
        </View>

        <Pressable
          style={styles.addBtnHeader}
          onPress={() =>
            handleOpenAddModal(selectedType !== 'all' ? (selectedType as any) : 'character')
          }>
          <Text style={styles.addBtnHeaderText}>+ Thêm node</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Search */}
        <View style={styles.searchBarContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Tìm kiếm node theo tên, vai trò, lai lịch..."
            placeholderTextColor="#736a5c"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={10}>
              <Text style={styles.searchClearIcon}>✕</Text>
            </Pressable>
          )}
        </View>

        {/* Filter Chips Bar */}
        <View style={styles.filterRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {[
              { id: 'all', label: `Tất cả (${nodes.length})`, symbol: '◈' },
              { id: 'character', label: 'Nhân vật', symbol: '●', color: '#e5a93c' },
              { id: 'item', label: 'Vật phẩm', symbol: '◆', color: '#42b883' },
              { id: 'location', label: 'Địa điểm', symbol: '▲', color: '#9f70cf' },
              { id: 'faction', label: 'Phe phái', symbol: '⬡', color: '#d95a38' },
              { id: 'event', label: 'Sự kiện', symbol: '■', color: '#5b8ec2' },
            ].map((f) => {
              const isSelected = selectedType === f.id;
              return (
                <Pressable
                  key={f.id}
                  style={[
                    styles.filterChip,
                    isSelected && styles.filterChipSelected,
                    isSelected && f.color ? { borderColor: f.color } : null,
                  ]}
                  onPress={() => setSelectedType(f.id)}>
                  <Text style={[styles.filterChipSymbol, f.color ? { color: f.color } : { color: '#8f887b' }]}>
                    {f.symbol}
                  </Text>
                  <Text
                    style={[
                      styles.filterChipText,
                      isSelected && styles.filterChipTextSelected,
                      isSelected && f.color ? { color: f.color } : null,
                    ]}>
                    {f.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Nodes List */}
        <View style={styles.cardsContainer}>
          {filteredNodes.map((node) => {
            const config = NODE_TYPE_CONFIG[node.type] || NODE_TYPE_CONFIG.character;
            return (
              <View key={node.id} style={[styles.nodeCard, { borderTopColor: config.color }]}>
                <View style={styles.nodeHeaderRow}>
                  <View style={styles.nodeLeft}>
                    <View
                      style={[
                        styles.symbolBox,
                        { borderColor: config.color, backgroundColor: `${config.color}15` },
                      ]}>
                      <Text style={[styles.nodeSymbol, { color: config.color }]}>{config.symbol}</Text>
                    </View>
                    <View>
                      <Text style={styles.nodeName}>{node.name}</Text>
                      <Text style={styles.nodeTypeSub}>
                        {config.badgeText} {node.subType ? `· ${node.subType}` : ''}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.badgeCol}>
                    {node.type === 'character' && node.role ? (
                      <View
                        style={[
                          styles.nodeRoleBadge,
                          { borderColor: `${config.color}60`, backgroundColor: `${config.color}12` },
                        ]}>
                        <Text style={[styles.nodeRoleText, { color: config.color }]}>{node.role}</Text>
                      </View>
                    ) : null}
                    {node.status ? (
                      <View style={styles.statusBadge}>
                        <Text style={styles.statusBadgeText}>{node.status}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                {/* Differentiated Attributes Summary Box */}
                <View style={styles.attributesGrid}>
                  {node.dob ? <Text style={styles.attrTag}>📅 Ngày sinh: {node.dob}</Text> : null}
                  {node.birthplace ? (
                    <Text style={styles.attrTag}>📍 Nơi sinh: {node.birthplace}</Text>
                  ) : null}
                  {node.gender ? <Text style={styles.attrTag}>⚧ Giới tính: {node.gender}</Text> : null}
                  {node.weapon ? <Text style={styles.attrTag}>⚔️ Binh khí: {node.weapon}</Text> : null}
                  {node.sect ? <Text style={styles.attrTag}>🏛️ Môn phái: {node.sect}</Text> : null}
                  {node.personality ? (
                    <Text style={styles.attrTag}>🎭 Tính cách: {node.personality}</Text>
                  ) : null}
                  {node.rarity ? <Text style={styles.attrTag}>💎 Độ hiếm: {node.rarity}</Text> : null}
                  {node.origin ? <Text style={styles.attrTag}>📜 Xuất xứ: {node.origin}</Text> : null}
                  {node.element ? <Text style={styles.attrTag}>⚡ Thuộc tính: {node.element}</Text> : null}
                  {node.power ? <Text style={styles.attrTag}>💥 Uy lực: {node.power}</Text> : null}
                  {node.holderOrLocation ? (
                    <Text style={styles.attrTag}>👤 Người giữ: {node.holderOrLocation}</Text>
                  ) : null}
                  {node.region ? <Text style={styles.attrTag}>📍 Khu vực: {node.region}</Text> : null}
                  {node.terrain ? <Text style={styles.attrTag}>🏔️ Địa thế: {node.terrain}</Text> : null}
                  {node.dangerLevel ? (
                    <Text style={styles.attrTag}>⚠️ Nguy hiểm: {node.dangerLevel}</Text>
                  ) : null}
                  {node.ruler ? <Text style={styles.attrTag}>🏰 Cai quản: {node.ruler}</Text> : null}
                  {node.leader ? <Text style={styles.attrTag}>👑 Thủ lĩnh: {node.leader}</Text> : null}
                  {node.headquarters ? (
                    <Text style={styles.attrTag}>🏯 Tổng đàn: {node.headquarters}</Text>
                  ) : null}
                  {node.motto ? <Text style={styles.attrTag}>📜 Tôn chỉ: {node.motto}</Text> : null}
                  {node.alignment ? (
                    <Text style={styles.attrTag}>⚖️ Lập trường: {node.alignment}</Text>
                  ) : null}
                  {node.time ? <Text style={styles.attrTag}>⏳ Thời điểm: {node.time}</Text> : null}
                  {node.location ? <Text style={styles.attrTag}>📍 Nơi diễn ra: {node.location}</Text> : null}
                  {node.impact ? <Text style={styles.attrTag}>⚡ Ảnh hưởng: {node.impact}</Text> : null}
                </View>

                {node.desc ? (
                  <View style={styles.nodeDescBox}>
                    <Text style={styles.nodeDesc}>{node.desc}</Text>
                  </View>
                ) : null}

                {/* Actions */}
                <View style={styles.nodeFooter}>
                  <Pressable
                    style={styles.locateBtn}
                    onPress={() => {
                      router.push({
                        pathname: '/graph' as any,
                        params: { projectId: currentProject.id },
                      });
                    }}>
                    <Text style={styles.locateBtnText}>Xem trên đồ thị →</Text>
                  </Pressable>

                  <View style={styles.cardActionsGroup}>
                    <Pressable style={styles.cardEditBtn} onPress={() => handleOpenEditModal(node)}>
                      <Text style={styles.cardEditText}>✏️ Sửa</Text>
                    </Pressable>
                    <Pressable style={styles.cardDeleteBtn} onPress={() => handleDeleteNode(node)}>
                      <Text style={styles.cardDeleteText}>🗑️ Xóa</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          })}

          {!isLoading && filteredNodes.length === 0 && (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>◈</Text>
              <Text style={styles.emptyTitle}>Chưa có thực thể phù hợp</Text>
              <Text style={styles.emptyDesc}>
                {nodes.length === 0
                  ? 'Dự án này chưa có node nào. Hãy nhấn nút "+ Thêm node" ở góc trên để tạo mới.'
                  : 'Không tìm thấy node nào khớp với bộ lọc hiện tại.'}
              </Text>
            </View>
          )}

          {isLoading && (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <ActivityIndicator size="large" color="#e5a93c" />
            </View>
          )}
        </View>
      </ScrollView>

      {/* Dynamic Add / Edit Node Modal */}
      <Modal visible={modalOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCardLarge}>
            <View style={styles.modalTitleRow}>
              <Text style={styles.modalTitle}>
                {isEditing ? 'Chỉnh sửa thực thể' : 'Thêm thực thể vào dự án'}
              </Text>
              <Pressable onPress={() => setModalOpen(false)} hitSlop={10}>
                <Text style={styles.closeCardText}>✕</Text>
              </Pressable>
            </View>

            <ScrollView
              style={{ maxHeight: SCREEN_HEIGHT * 0.7 }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: 14 }}>
              {/* Type Selector */}
              <View style={styles.modalInputGroup}>
                <Text style={styles.modalInputLabel}>Loại phân loại thực thể</Text>
                <View style={styles.typeSelectorRow}>
                  {(
                    [
                      'character',
                      'item',
                      'location',
                      'faction',
                      'event',
                    ] as const
                  ).map((t) => (
                    <Pressable
                      key={t}
                      style={[
                        styles.typeOptionChip,
                        formType === t && {
                          borderColor: NODE_TYPE_CONFIG[t]?.color || '#e5a93c',
                          backgroundColor: `${NODE_TYPE_CONFIG[t]?.color || '#e5a93c'}20`,
                        },
                      ]}
                      onPress={() => {
                        setFormType(t);
                        if (!isEditing) {
                          setFormId(generateUniqueNodeId(t, nodes));
                          if (t === 'character') {
                            setFormSubType('Kiếm khách / Đao khách');
                          } else {
                            setFormSubType('');
                          }
                          setFormStatus(
                            t === 'character'
                              ? 'Còn sống'
                              : t === 'item'
                              ? 'Nguyên vẹn'
                              : t === 'location'
                              ? 'Hoạt động'
                              : t === 'faction'
                              ? 'Hưng thịnh'
                              : 'Đã diễn ra'
                          );
                        }
                      }}>
                      <Text
                        style={{
                          color: NODE_TYPE_CONFIG[t]?.color || '#e5a93c',
                          fontSize: 12,
                          fontWeight: '600',
                        }}>
                        {NODE_TYPE_CONFIG[t]?.symbol} {NODE_TYPE_CONFIG[t]?.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Name Input (Single Clean Input, no Auto Unique ID) */}
              <View style={styles.modalInputGroup}>
                <Text style={styles.modalInputLabel}>Tên thực thể *</Text>
                <TextInput
                  style={styles.modalInput}
                  value={formName}
                  onChangeText={setFormName}
                  placeholder="Nhập tên thực thể..."
                  placeholderTextColor="#665f52"
                />
              </View>

              {/* ============ DYNAMIC FIELDS FOR CHARACTER ============ */}
              {formType === 'character' && (
                <View style={styles.dynamicSectionBox}>
                  <Text style={styles.dynamicSectionHeader}>THÔNG TIN NHÂN VẬT</Text>

                  {/* Role & Profession */}
                  <View style={styles.formRow}>
                    <View style={[styles.modalInputGroup, { flex: 1 }]}>
                      <Text style={styles.modalInputLabel}>Vai trò / Nhãn</Text>
                      <TextInput
                        style={styles.modalInput}
                        value={formRole}
                        onChangeText={setFormRole}
                        placeholder="Ví dụ: NHÂN VẬT CHÍNH"
                        placeholderTextColor="#665f52"
                      />
                    </View>

                    <View style={[styles.modalInputGroup, { flex: 1 }]}>
                      <Text style={styles.modalInputLabel}>Phân loại phụ (Nghề nghiệp)</Text>
                      <FormSelectField
                        value={formSubType}
                        onChange={setFormSubType}
                        options={CHARACTER_PROFESSIONS.map((p) => ({
                          label: p,
                          value: p,
                          icon: '🎭',
                        }))}
                        allowCustom
                        placeholder="-- Chọn nghề nghiệp --"
                        customPlaceholder="Tự nhập nghề nghiệp khác..."
                      />
                    </View>
                  </View>

                  {/* Status Dropdown (Còn sống / Đã chết / Hồi sinh) */}
                  <View style={styles.formRow}>
                    <View style={[styles.modalInputGroup, { flex: 1 }]}>
                      <Text style={styles.modalInputLabel}>Trạng thái hiện tại</Text>
                      <FormSelectField
                        value={formStatus}
                        onChange={setFormStatus}
                        options={CHARACTER_STATUS_OPTIONS}
                        placeholder="-- Chọn trạng thái --"
                      />
                    </View>

                    {(formStatus === 'Đã chết' || formStatus === 'Hồi sinh') && (
                      <View style={[styles.modalInputGroup, { flex: 1 }]}>
                        <Text style={styles.modalInputLabel}>
                          Sự kiện {formStatus === 'Đã chết' ? 'tử nạn' : 'hồi sinh'}
                        </Text>
                        <FormSelectField
                          value={formStatusEvent}
                          onChange={setFormStatusEvent}
                          options={eventNodes.map((e) => ({
                            label: e.name,
                            value: e.name,
                            subtitle: e.chapter || 'Biến cố',
                            icon: '⚡',
                          }))}
                          placeholder="-- Chọn sự kiện --"
                        />
                      </View>
                    )}
                  </View>

                  {/* Dob & Birthplace */}
                  <View style={styles.formRow}>
                    <View style={[styles.modalInputGroup, { flex: 1 }]}>
                      <Text style={styles.modalInputLabel}>Ngày sinh</Text>
                      <DatePickerField
                        value={formDob}
                        onChange={setFormDob}
                        placeholder="Chọn ngày sinh"
                      />
                    </View>
                    <View style={[styles.modalInputGroup, { flex: 1 }]}>
                      <Text style={styles.modalInputLabel}>Nơi sinh ra</Text>
                      <FormSelectField
                        value={formBirthplace}
                        onChange={setFormBirthplace}
                        options={locationNodes.map((loc) => ({
                          label: loc.name,
                          value: loc.name,
                          subtitle: loc.region || loc.role || 'Địa danh',
                          icon: '📍',
                        }))}
                        placeholder="-- Chọn địa điểm --"
                      />
                    </View>
                  </View>

                  {/* Gender & Weapon */}
                  <View style={styles.formRow}>
                    <View style={[styles.modalInputGroup, { flex: 1 }]}>
                      <Text style={styles.modalInputLabel}>Giới tính</Text>
                      <FormSelectField
                        value={formGender}
                        onChange={setFormGender}
                        options={GENDER_OPTIONS}
                        placeholder="-- Chọn giới tính --"
                      />
                    </View>
                    <View style={[styles.modalInputGroup, { flex: 1 }]}>
                      <Text style={styles.modalInputLabel}>Binh khí / Vật phẩm</Text>
                      <FormSelectField
                        value={formWeapon}
                        onChange={setFormWeapon}
                        options={itemNodes.map((it) => ({
                          label: it.name,
                          value: it.name,
                          subtitle: it.rarity || it.role || 'Vật phẩm',
                          icon: '🗡️',
                        }))}
                        placeholder="-- Chọn vật phẩm --"
                      />
                    </View>
                  </View>

                  {/* Sect & Personality */}
                  <View style={styles.formRow}>
                    <View style={[styles.modalInputGroup, { flex: 1 }]}>
                      <Text style={styles.modalInputLabel}>Môn phái / Thế lực</Text>
                      <FormSelectField
                        value={formSect}
                        onChange={setFormSect}
                        options={factionNodes.map((fac) => ({
                          label: fac.name,
                          value: fac.name,
                          subtitle: fac.alignment || fac.role || 'Môn phái',
                          icon: '🏛️',
                        }))}
                        placeholder="-- Chọn môn phái --"
                      />
                    </View>
                    <View style={[styles.modalInputGroup, { flex: 1 }]}>
                      <Text style={styles.modalInputLabel}>Tính cách</Text>
                      <TextInput
                        style={styles.modalInput}
                        value={formPersonality}
                        onChangeText={setFormPersonality}
                        placeholder="Ví dụ: Trầm mặc, kiên định"
                        placeholderTextColor="#665f52"
                      />
                    </View>
                  </View>
                </View>
              )}

              {/* ============ DYNAMIC FIELDS FOR ITEM ============ */}
              {formType === 'item' && (
                <View style={styles.dynamicSectionBox}>
                  <Text style={[styles.dynamicSectionHeader, { color: '#42b883' }]}>
                    THÔNG TIN BẢO VẬT / VẬT PHẨM
                  </Text>
                  <View style={styles.formRow}>
                    <View style={[styles.modalInputGroup, { flex: 1 }]}>
                      <Text style={styles.modalInputLabel}>Độ hiếm</Text>
                      <FormSelectField
                        value={formRarity}
                        onChange={setFormRarity}
                        options={ITEM_RARITY_OPTIONS}
                        placeholder="-- Chọn độ hiếm --"
                      />
                    </View>
                    <View style={[styles.modalInputGroup, { flex: 1 }]}>
                      <Text style={styles.modalInputLabel}>Nguồn gốc xuất xứ</Text>
                      <FormSelectField
                        value={formOrigin}
                        onChange={setFormOrigin}
                        options={locationNodes.map((loc) => ({
                          label: loc.name,
                          value: loc.name,
                          subtitle: loc.region || 'Địa danh',
                          icon: '📍',
                        }))}
                        placeholder="-- Chọn nguồn gốc (Địa danh) --"
                      />
                    </View>
                  </View>

                  <View style={styles.modalInputGroup}>
                    <Text style={styles.modalInputLabel}>Người sở hữu / Nắm giữ</Text>
                    <FormSelectField
                      value={formHolder}
                      onChange={setFormHolder}
                      options={characterNodes.map((c) => ({
                        label: c.name,
                        value: c.name,
                        subtitle: c.role || 'Nhân vật',
                        icon: '👤',
                      }))}
                      placeholder="-- Chọn người sở hữu --"
                    />
                  </View>
                </View>
              )}

              {/* ============ DYNAMIC FIELDS FOR LOCATION ============ */}
              {formType === 'location' && (
                <View style={styles.dynamicSectionBox}>
                  <Text style={[styles.dynamicSectionHeader, { color: '#9f70cf' }]}>
                    THÔNG TIN ĐỊA DANH / ĐỊA ĐIỂM
                  </Text>
                  <View style={styles.formRow}>
                    <View style={[styles.modalInputGroup, { flex: 1 }]}>
                      <Text style={styles.modalInputLabel}>Khu vực / Phương hướng</Text>
                      <FormSelectField
                        value={formRegion}
                        onChange={setFormRegion}
                        options={LOCATION_REGION_OPTIONS}
                        placeholder="-- Chọn khu vực --"
                      />
                    </View>
                    <View style={[styles.modalInputGroup, { flex: 1 }]}>
                      <Text style={styles.modalInputLabel}>Mức độ nguy hiểm</Text>
                      <FormSelectField
                        value={formDangerLevel}
                        onChange={setFormDangerLevel}
                        options={LOCATION_DANGER_OPTIONS}
                        placeholder="-- Chọn mức độ nguy hiểm --"
                      />
                    </View>
                  </View>

                  <View style={styles.formRow}>
                    <View style={[styles.modalInputGroup, { flex: 1 }]}>
                      <Text style={styles.modalInputLabel}>Khí hậu đặc trưng</Text>
                      <FormSelectField
                        value={formClimate}
                        onChange={setFormClimate}
                        options={LOCATION_CLIMATE_OPTIONS}
                        placeholder="-- Chọn khí hậu --"
                      />
                    </View>
                    <View style={[styles.modalInputGroup, { flex: 1 }]}>
                      <Text style={styles.modalInputLabel}>Thế lực cai quản</Text>
                      <FormSelectField
                        value={formRuler}
                        onChange={setFormRuler}
                        options={factionNodes.map((fac) => ({
                          label: fac.name,
                          value: fac.name,
                          subtitle: fac.alignment || 'Môn phái',
                          icon: '🏛️',
                        }))}
                        placeholder="-- Chọn thế lực cai quản --"
                      />
                    </View>
                  </View>
                </View>
              )}

              {/* ============ DYNAMIC FIELDS FOR FACTION ============ */}
              {formType === 'faction' && (
                <View style={styles.dynamicSectionBox}>
                  <Text style={[styles.dynamicSectionHeader, { color: '#d95a38' }]}>
                    THÔNG TIN PHE PHÁI / MÔN PHÁI
                  </Text>
                  <View style={styles.modalInputGroup}>
                    <Text style={styles.modalInputLabel}>Phân loại môn phái (Chính / Tà)</Text>
                    <FormSelectField
                      value={formSubType}
                      onChange={setFormSubType}
                      options={FACTION_CLASSIFICATIONS}
                      placeholder="-- Chọn chính hoặc tà --"
                    />
                  </View>

                  {/* Status Dropdown (Hưng thịnh / Suy tàn) */}
                  <View style={styles.formRow}>
                    <View style={[styles.modalInputGroup, { flex: 1 }]}>
                      <Text style={styles.modalInputLabel}>Trạng thái phe phái</Text>
                      <FormSelectField
                        value={formStatus}
                        onChange={setFormStatus}
                        options={FACTION_STATUS_OPTIONS}
                        placeholder="-- Chọn trạng thái --"
                      />
                    </View>

                    {formStatus === 'Suy tàn' && (
                      <View style={[styles.modalInputGroup, { flex: 1 }]}>
                        <Text style={styles.modalInputLabel}>Sự kiện dẫn đến suy tàn</Text>
                        <FormSelectField
                          value={formStatusEvent}
                          onChange={setFormStatusEvent}
                          options={eventNodes.map((e) => ({
                            label: e.name,
                            value: e.name,
                            subtitle: e.chapter || 'Biến cố',
                            icon: '⚡',
                          }))}
                          placeholder="-- Chọn sự kiện --"
                        />
                      </View>
                    )}
                  </View>

                  {/* Minh chủ & Căn cứ */}
                  <View style={styles.formRow}>
                    <View style={[styles.modalInputGroup, { flex: 1 }]}>
                      <Text style={styles.modalInputLabel}>Minh chủ / Thủ lĩnh</Text>
                      <FormSelectField
                        value={formLeader}
                        onChange={setFormLeader}
                        options={characterNodes.map((c) => ({
                          label: c.name,
                          value: c.name,
                          subtitle: c.role || 'Nhân vật',
                          icon: '👤',
                        }))}
                        placeholder="-- Chọn thủ lĩnh --"
                      />
                    </View>
                    <View style={[styles.modalInputGroup, { flex: 1 }]}>
                      <Text style={styles.modalInputLabel}>Tổng đàn / Căn cứ địa</Text>
                      <FormSelectField
                        value={formHeadquarters}
                        onChange={setFormHeadquarters}
                        options={locationNodes.map((l) => ({
                          label: l.name,
                          value: l.name,
                          subtitle: l.region || 'Địa danh',
                          icon: '📍',
                        }))}
                        placeholder="-- Chọn căn cứ --"
                      />
                    </View>
                  </View>

                  <View style={styles.modalInputGroup}>
                    <Text style={styles.modalInputLabel}>Tôn chỉ</Text>
                    <TextInput
                      style={styles.modalInput}
                      value={formMotto}
                      onChangeText={setFormMotto}
                      placeholder="Ví dụ: Quy tụ võ lâm / Trảm yêu trừ ma..."
                      placeholderTextColor="#665f52"
                    />
                  </View>
                </View>
              )}

              {/* ============ DYNAMIC FIELDS FOR EVENT ============ */}
              {formType === 'event' && (
                <View style={styles.dynamicSectionBox}>
                  <Text style={[styles.dynamicSectionHeader, { color: '#5b8ec2' }]}>
                    THÔNG TIN BIẾN CỐ / SỰ KIỆN
                  </Text>
                  <View style={styles.formRow}>
                    <View style={[styles.modalInputGroup, { flex: 1 }]}>
                      <Text style={styles.modalInputLabel}>Chương</Text>
                      <FormSelectField
                        value={formChapter}
                        onChange={setFormChapter}
                        options={chapters.map((ch) => ({
                          label: `Chương ${ch.chapterNumber}: ${ch.title}`,
                          value: ch.title,
                          subtitle: ch.desc,
                        }))}
                        placeholder="-- Chọn chương --"
                      />
                    </View>
                    <View style={[styles.modalInputGroup, { flex: 1 }]}>
                      <Text style={styles.modalInputLabel}>Nơi diễn ra</Text>
                      <FormSelectField
                        value={formLocation}
                        onChange={setFormLocation}
                        options={locationNodes.map((loc) => ({
                          label: loc.name,
                          value: loc.name,
                          subtitle: loc.region || 'Địa danh',
                          icon: '📍',
                        }))}
                        placeholder="-- Chọn nơi diễn ra --"
                      />
                    </View>
                  </View>
                </View>
              )}

              {/* Description */}
              <View style={styles.modalInputGroup}>
                <Text style={styles.modalInputLabel}>Mô tả chi tiết</Text>
                <TextInput
                  style={[styles.modalInput, { height: 75, textAlignVertical: 'top' }]}
                  value={formDesc}
                  onChangeText={setFormDesc}
                  placeholder="Ghi chú bối cảnh, lai lịch, cốt truyện liên quan..."
                  placeholderTextColor="#665f52"
                  multiline
                />
              </View>
            </ScrollView>

            <View style={styles.modalActionRow}>
              <Pressable
                style={styles.modalCancelBtn}
                onPress={() => setModalOpen(false)}
                disabled={isSubmitting}>
                <Text style={styles.modalCancelText}>Hủy</Text>
              </Pressable>
              <Pressable
                style={[styles.modalConfirmBtn, isSubmitting && { opacity: 0.6 }]}
                onPress={handleSaveNode}
                disabled={isSubmitting}>
                <Text style={styles.modalConfirmText}>
                  {isSubmitting ? 'Đang lưu...' : isEditing ? 'Lưu thay đổi' : 'Thêm Node'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: ThemeColors.background,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1c1a15',
  },
  headerLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#2d271e',
    backgroundColor: '#15130f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnPressed: {
    backgroundColor: '#26221a',
  },
  backBtnIcon: {
    color: '#d19839',
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '300',
  },
  headerTitle: {
    color: '#e0d8cb',
    fontFamily: AppFonts.serif,
    fontSize: 18,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: '#736a5c',
    fontSize: 10.5,
    letterSpacing: 1.5,
    fontFamily: AppFonts.sans,
    fontWeight: '600',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  addBtnHeader: {
    backgroundColor: '#d19839',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 4,
  },
  addBtnHeaderText: {
    color: '#12100d',
    fontWeight: '700',
    fontSize: 12.5,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 16,
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#13110d',
    borderWidth: 1,
    borderColor: '#262118',
    borderRadius: 6,
    paddingHorizontal: 12,
    height: 44,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 8,
    color: '#736a5c',
  },
  searchInput: {
    flex: 1,
    color: '#ded5c7',
    fontSize: 13,
    fontFamily: AppFonts.sans,
    height: '100%',
  },
  searchClearIcon: {
    color: '#736a5c',
    fontSize: 14,
    padding: 4,
  },
  filterRow: {
    marginBottom: 4,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#262118',
    backgroundColor: '#13110d',
    gap: 6,
  },
  filterChipSelected: {
    backgroundColor: 'rgba(209, 152, 57, 0.12)',
    borderColor: '#d19839',
  },
  filterChipSymbol: {
    fontSize: 11,
  },
  filterChipText: {
    fontSize: 12,
    color: '#8f887b',
    fontFamily: AppFonts.sans,
    fontWeight: '500',
  },
  filterChipTextSelected: {
    color: '#ded5c7',
    fontWeight: '600',
  },
  cardsContainer: {
    gap: 14,
  },
  nodeCard: {
    backgroundColor: '#13110d',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#262118',
    borderTopWidth: 3,
    padding: 14,
    gap: 10,
  },
  nodeHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  nodeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  symbolBox: {
    width: 34,
    height: 34,
    borderRadius: 4,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeSymbol: {
    fontSize: 15,
  },
  nodeName: {
    color: '#ded5c7',
    fontFamily: AppFonts.serif,
    fontSize: 17,
    fontWeight: '700',
  },
  nodeTypeSub: {
    color: '#736a5c',
    fontSize: 11,
    marginTop: 2,
    fontFamily: AppFonts.sans,
  },
  badgeCol: {
    alignItems: 'flex-end',
    gap: 4,
  },
  nodeRoleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },
  nodeRoleText: {
    fontSize: 10.5,
    fontFamily: AppFonts.sans,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  statusBadge: {
    backgroundColor: 'rgba(229,169,60,0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: 'rgba(229,169,60,0.25)',
  },
  statusBadgeText: {
    fontSize: 9.5,
    color: '#e5a93c',
    fontWeight: '600',
  },
  attributesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    backgroundColor: '#0f0e0b',
    padding: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#1d1913',
  },
  attrTagMono: {
    fontSize: 10.5,
    color: '#7a705e',
    fontFamily: AppFonts.mono,
    backgroundColor: '#171510',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  attrTag: {
    fontSize: 11,
    color: '#b0a696',
    backgroundColor: '#1b1812',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  nodeDescBox: {
    backgroundColor: '#0c0b08',
    padding: 10,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#1f1b14',
  },
  nodeDesc: {
    color: '#8f887b',
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: AppFonts.sans,
  },
  nodeFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#1f1b14',
    paddingTop: 10,
  },
  locateBtn: {
    paddingVertical: 4,
  },
  locateBtnText: {
    color: '#d19839',
    fontSize: 12.5,
    fontFamily: AppFonts.sans,
    fontWeight: '600',
  },
  cardActionsGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  cardEditBtn: {
    backgroundColor: '#201d16',
    borderWidth: 1,
    borderColor: '#383224',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 4,
  },
  cardEditText: {
    color: '#e5a93c',
    fontSize: 11.5,
    fontWeight: '600',
  },
  cardDeleteBtn: {
    backgroundColor: '#221313',
    borderWidth: 1,
    borderColor: '#4d2020',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 4,
  },
  cardDeleteText: {
    color: '#e05252',
    fontSize: 11.5,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  emptyIcon: {
    fontSize: 28,
    color: '#3d372b',
    marginBottom: 4,
  },
  emptyTitle: {
    color: '#ded5c7',
    fontFamily: AppFonts.serif,
    fontSize: 16,
    fontWeight: '600',
  },
  emptyDesc: {
    color: '#736a5c',
    fontSize: 12.5,
    textAlign: 'center',
    maxWidth: 280,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  modalCardLarge: {
    width: '100%',
    maxWidth: 500,
    backgroundColor: '#191713',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#383226',
    padding: 20,
    gap: 14,
  },
  modalTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    color: '#e5a93c',
    fontFamily: AppFonts.serif,
    fontWeight: '700',
  },
  closeCardText: {
    color: '#8f887b',
    fontSize: 14,
  },
  modalInputGroup: {
    gap: 5,
  },
  modalInputLabel: {
    fontSize: 12,
    color: '#a39a8c',
    fontWeight: '600',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#2d281f',
    backgroundColor: '#12110e',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#f5eee6',
    fontSize: 13.5,
  },
  inputLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  autoIdBadge: {
    fontSize: 9,
    fontWeight: '700',
    color: '#e5a93c',
    backgroundColor: '#e5a93c15',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#e5a93c40',
  },
  autoIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  autoIdInput: {
    flex: 1,
    backgroundColor: '#1b1713',
    borderColor: '#3d3328',
    color: '#e5a93c',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
  },
  refreshIdBtn: {
    paddingHorizontal: 8,
    paddingVertical: 9,
    backgroundColor: '#26201a',
    borderWidth: 1,
    borderColor: '#4d3f32',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  refreshIdText: {
    color: '#e5a93c',
    fontSize: 11,
    fontWeight: '600',
  },
  formRow: {
    flexDirection: 'row',
    gap: 10,
  },
  typeSelectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeOptionChip: {
    borderWidth: 1,
    borderColor: '#2d281f',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#12110e',
  },
  dynamicSectionBox: {
    backgroundColor: '#13110e',
    borderWidth: 1,
    borderColor: '#29251e',
    borderRadius: 8,
    padding: 12,
    gap: 10,
  },
  dynamicSectionHeader: {
    fontSize: 11,
    letterSpacing: 1.5,
    color: '#e5a93c',
    fontWeight: '700',
    fontFamily: AppFonts.mono,
    marginBottom: 2,
  },
  modalActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 4,
  },
  modalCancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  modalCancelText: {
    color: '#8f887b',
    fontSize: 13.5,
  },
  modalConfirmBtn: {
    backgroundColor: '#db9d33',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  modalConfirmText: {
    color: '#15130e',
    fontWeight: '700',
    fontSize: 13.5,
  },
});
