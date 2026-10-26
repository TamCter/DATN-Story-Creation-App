import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

export interface SelectOption {
  label: string;
  value: string;
  subtitle?: string;
  badge?: string;
  icon?: string;
}

interface FormSelectFieldProps {
  value: string;
  onChange: (val: string) => void;
  options: SelectOption[];
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  allowCustom?: boolean;
  customPlaceholder?: string;
}

export function FormSelectField({
  value,
  onChange,
  options,
  placeholder = '-- Chọn một mục --',
  emptyMessage = '⚠️ Chưa có dữ liệu phù hợp trong dự án (Không có)',
  disabled = false,
  allowCustom = false,
  customPlaceholder = 'Nhập giá trị tùy chỉnh...',
}: FormSelectFieldProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [search, setSearch] = useState('');
  const [isCustomMode, setIsCustomMode] = useState(() => {
    if (!value) return false;
    return !options.some((o) => o.value === value);
  });
  const [customVal, setCustomVal] = useState(value || '');

  const isDisabled = disabled || options.length === 0;

  // Selected Option Object
  const selectedOption = options.find((o) => o.value === value);

  const filteredOptions = options.filter(
    (o) =>
      o.label.toLowerCase().includes(search.toLowerCase()) ||
      (o.subtitle && o.subtitle.toLowerCase().includes(search.toLowerCase()))
  );

  const handleSelect = (val: string) => {
    setIsCustomMode(false);
    onChange(val);
    setModalVisible(false);
  };

  const handleApplyCustom = () => {
    onChange(customVal.trim());
    setModalVisible(false);
  };

  if (isDisabled) {
    return (
      <View style={styles.wrapper}>
        <View style={[styles.triggerButton, styles.triggerButtonDisabled]}>
          <Text numberOfLines={1} style={styles.disabledText}>
            {value ? value : (placeholder || '-- Không có --')}
          </Text>
          <Text style={styles.chevronIconDisabled}>▼</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      {/* Trigger Button */}
      <Pressable
        style={styles.triggerButton}
        onPress={() => {
          setSearch('');
          setModalVisible(true);
        }}>
        <View style={styles.triggerContent}>
          {selectedOption?.icon ? (
            <Text style={styles.optionIcon}>{selectedOption.icon}</Text>
          ) : null}
          <Text
            numberOfLines={1}
            style={[
              styles.triggerText,
              !value && styles.placeholderText,
            ]}>
            {selectedOption ? selectedOption.label : value ? `✏️ ${value}` : placeholder}
          </Text>
        </View>

        <View style={styles.rightAction}>
          {value ? (
            <Pressable
              hitSlop={8}
              onPress={(e) => {
                e.stopPropagation();
                onChange('');
                setCustomVal('');
              }}>
              <Text style={styles.clearBtnText}>✕</Text>
            </Pressable>
          ) : null}
          <Text style={styles.chevronIcon}>▼</Text>
        </View>
      </Pressable>

      {/* If custom mode is active or user typed custom value */}
      {isCustomMode && allowCustom && (
        <View style={styles.customRow}>
          <TextInput
            style={styles.customInput}
            value={value}
            onChangeText={(txt) => {
              setCustomVal(txt);
              onChange(txt);
            }}
            placeholder={customPlaceholder}
            placeholderTextColor="#665f52"
          />
        </View>
      )}

      {/* Selection Modal */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Lựa chọn danh mục</Text>
              <Pressable onPress={() => setModalVisible(false)} hitSlop={10}>
                <Text style={styles.closeBtn}>✕</Text>
              </Pressable>
            </View>

            {options.length > 5 && (
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="🔍 Tìm kiếm..."
                placeholderTextColor="#736a5c"
              />
            )}

            <ScrollView style={styles.optionsList} showsVerticalScrollIndicator={false}>
              {/* Option to clear / unselect */}
              <Pressable
                style={[styles.optionItem, !value && styles.optionItemActive]}
                onPress={() => handleSelect('')}>
                <Text style={styles.emptyOptionText}>-- Không có --</Text>
              </Pressable>

              {filteredOptions.map((opt) => {
                const isSelected = value === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    style={[styles.optionItem, isSelected && styles.optionItemActive]}
                    onPress={() => handleSelect(opt.value)}>
                    <View style={styles.optLeft}>
                      {opt.icon ? <Text style={styles.optIcon}>{opt.icon}</Text> : null}
                      <View>
                        <Text
                          style={[
                            styles.optLabel,
                            isSelected && styles.optLabelActive,
                          ]}>
                          {opt.label}
                        </Text>
                        {opt.subtitle ? (
                          <Text style={styles.optSubtitle}>{opt.subtitle}</Text>
                        ) : null}
                      </View>
                    </View>

                    {opt.badge ? (
                      <View style={styles.badgeBox}>
                        <Text style={styles.badgeText}>{opt.badge}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}

              {/* Allow Custom Option */}
              {allowCustom && (
                <View style={styles.customSection}>
                  <Text style={styles.customSectionTitle}>Hoặc tự nhập giá trị khác:</Text>
                  <View style={styles.customInputRow}>
                    <TextInput
                      style={styles.modalCustomInput}
                      value={customVal}
                      onChangeText={setCustomVal}
                      placeholder={customPlaceholder}
                      placeholderTextColor="#736a5c"
                    />
                    <Pressable
                      style={styles.customConfirmBtn}
                      onPress={() => {
                        setIsCustomMode(true);
                        handleApplyCustom();
                      }}>
                      <Text style={styles.customConfirmBtnText}>Áp dụng</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    gap: 6,
  },
  triggerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1b1713',
    borderWidth: 1,
    borderColor: '#4a3e30',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 40,
  },
  triggerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 8,
  },
  triggerText: {
    color: '#f0e6d6',
    fontSize: 13,
  },
  placeholderText: {
    color: '#665f52',
  },
  optionIcon: {
    fontSize: 14,
  },
  rightAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clearBtnText: {
    color: '#d95a38',
    fontSize: 12,
    fontWeight: '700',
  },
  chevronIcon: {
    color: '#8c7d6b',
    fontSize: 10,
  },
  triggerButtonDisabled: {
    backgroundColor: '#161311',
    borderColor: '#2b231c',
    opacity: 0.45,
  },
  disabledText: {
    color: '#665f52',
    fontSize: 13,
  },
  chevronIconDisabled: {
    color: '#42372c',
    fontSize: 10,
  },
  customRow: {
    marginTop: 2,
  },
  customInput: {
    backgroundColor: '#161311',
    borderWidth: 1,
    borderColor: '#e5a93c60',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#e5a93c',
    fontSize: 12,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '80%',
    backgroundColor: '#1b1713',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#55483a',
    padding: 16,
    gap: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#e5a93c',
  },
  closeBtn: {
    color: '#8c7d6b',
    fontSize: 16,
    fontWeight: 'bold',
  },
  searchInput: {
    backgroundColor: '#26201a',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#3d3328',
    paddingHorizontal: 10,
    paddingVertical: 7,
    color: '#fff',
    fontSize: 12,
  },
  optionsList: {
    maxHeight: 340,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#2b231c',
  },
  optionItemActive: {
    backgroundColor: '#2a2219',
    borderLeftWidth: 3,
    borderLeftColor: '#e5a93c',
  },
  emptyOptionText: {
    color: '#8c7d6b',
    fontSize: 12,
    fontStyle: 'italic',
  },
  optLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  optIcon: {
    fontSize: 15,
  },
  optLabel: {
    color: '#f0e6d6',
    fontSize: 13,
    fontWeight: '500',
  },
  optLabelActive: {
    color: '#e5a93c',
    fontWeight: '700',
  },
  optSubtitle: {
    color: '#8c7d6b',
    fontSize: 11,
    marginTop: 2,
  },
  badgeBox: {
    backgroundColor: '#2e251d',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#4d3f32',
  },
  badgeText: {
    color: '#d9a74a',
    fontSize: 10,
    fontWeight: '600',
  },
  customSection: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#3d3328',
    gap: 8,
  },
  customSectionTitle: {
    color: '#8c7d6b',
    fontSize: 11,
    fontWeight: '600',
  },
  customInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modalCustomInput: {
    flex: 1,
    backgroundColor: '#26201a',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#3d3328',
    paddingHorizontal: 10,
    paddingVertical: 7,
    color: '#fff',
    fontSize: 12,
  },
  customConfirmBtn: {
    backgroundColor: '#e5a93c',
    borderRadius: 6,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  customConfirmBtnText: {
    color: '#120f0d',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
