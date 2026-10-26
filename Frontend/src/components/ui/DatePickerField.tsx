import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

interface DatePickerFieldProps {
  value: string;
  onChange: (date: string) => void;
  placeholder?: string;
}

const MONTH_NAMES = [
  'Tháng 1',
  'Tháng 2',
  'Tháng 3',
  'Tháng 4',
  'Tháng 5',
  'Tháng 6',
  'Tháng 7',
  'Tháng 8',
  'Tháng 9',
  'Tháng 10',
  'Tháng 11',
  'Tháng 12',
];

const WEEK_DAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export function DatePickerField({
  value,
  onChange,
  placeholder = 'Chọn ngày sinh',
}: DatePickerFieldProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [viewMode, setViewMode] = useState<'days' | 'months' | 'years'>('days');

  // Parse current value
  const parsed = useMemo(() => {
    if (!value) {
      const now = new Date();
      return {
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        day: now.getDate(),
      };
    }

    const match = value.match(/^(\d{1,4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (match) {
      const p1 = parseInt(match[1], 10);
      const p2 = parseInt(match[2], 10);
      const p3 = parseInt(match[3], 10);
      if (p1 > 31) {
        return {
          year: p1,
          month: Math.min(12, Math.max(1, p2)),
          day: Math.min(31, Math.max(1, p3)),
        };
      } else {
        return {
          year: p3,
          month: Math.min(12, Math.max(1, p2)),
          day: Math.min(31, Math.max(1, p1)),
        };
      }
    }

    const now = new Date();
    return {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
    };
  }, [value]);

  const [activeYear, setActiveYear] = useState(parsed.year);
  const [activeMonth, setActiveMonth] = useState(parsed.month);
  const [yearInput, setYearInput] = useState('');

  const handleOpenModal = () => {
    setActiveYear(parsed.year);
    setActiveMonth(parsed.month);
    setViewMode('days');
    setYearInput(String(parsed.year));
    setModalVisible(true);
  };

  const daysInMonth = useMemo(() => {
    return new Date(activeYear, activeMonth, 0).getDate();
  }, [activeYear, activeMonth]);

  const firstDayOffset = useMemo(() => {
    const day = new Date(activeYear, activeMonth - 1, 1).getDay();
    return (day + 6) % 7;
  }, [activeYear, activeMonth]);

  // When user taps a day -> select date, close modal, button displays the date
  const handleSelectDay = (day: number) => {
    const mStr = String(activeMonth).padStart(2, '0');
    const dStr = String(day).padStart(2, '0');
    onChange(`${activeYear}-${mStr}-${dStr}`);
    setModalVisible(false);
  };

  const handleSelectMonth = (mIndex: number) => {
    setActiveMonth(mIndex + 1);
    setViewMode('days');
  };

  const handleSelectYear = (y: number) => {
    setActiveYear(y);
    setViewMode('days');
  };

  const handleApplyYearInput = () => {
    const y = parseInt(yearInput.trim(), 10);
    if (!isNaN(y) && y > 0) {
      setActiveYear(y);
    }
    setViewMode('days');
  };

  const handleSetToday = () => {
    const now = new Date();
    const yStr = String(now.getFullYear());
    const mStr = String(now.getMonth() + 1).padStart(2, '0');
    const dStr = String(now.getDate()).padStart(2, '0');
    onChange(`${yStr}-${mStr}-${dStr}`);
    setModalVisible(false);
  };

  const handleClear = () => {
    onChange('');
    setModalVisible(false);
  };

  // Quick years list
  const yearsList = useMemo(() => {
    const list: number[] = [];
    const currentYr = new Date().getFullYear();
    for (let y = currentYr; y >= 1950; y--) {
      list.push(y);
    }
    const fantasyYears = [1500, 1400, 1300, 1200, 1100, 1042, 1000, 900, 888, 800, 500];
    for (const fy of fantasyYears) {
      if (!list.includes(fy)) list.push(fy);
    }
    list.sort((a, b) => b - a);
    return list;
  }, []);

  return (
    <View style={styles.wrapper}>
      {/* SINGLE BUTTON TRIGGER: Displays selected date or placeholder */}
      <Pressable style={styles.dateButton} onPress={handleOpenModal}>
        <View style={styles.dateButtonContent}>
          <Text style={styles.calendarIcon}>📅</Text>
          <Text
            numberOfLines={1}
            style={[styles.dateButtonText, !value && styles.placeholderText]}>
            {value ? value : placeholder}
          </Text>
        </View>

        {value ? (
          <Pressable
            style={styles.clearBtn}
            hitSlop={10}
            onPress={(e) => {
              e.stopPropagation();
              onChange('');
            }}>
            <Text style={styles.clearBtnText}>✕</Text>
          </Pressable>
        ) : (
          <Text style={styles.chevronIcon}>▼</Text>
        )}
      </Pressable>

      {/* CALENDAR POPUP MODAL */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.calendarCard}>
            {/* Header: Prev / Month & Year / Next / Close */}
            <View style={styles.calendarHeader}>
              <Pressable
                style={styles.navBtn}
                hitSlop={10}
                onPress={() => {
                  if (activeMonth > 1) {
                    setActiveMonth(activeMonth - 1);
                  } else {
                    setActiveMonth(12);
                    setActiveYear(activeYear - 1);
                  }
                }}>
                <Text style={styles.navBtnText}>‹</Text>
              </Pressable>

              <View style={styles.titlesRow}>
                <Pressable
                  style={[
                    styles.titleChip,
                    viewMode === 'months' && styles.titleChipActive,
                  ]}
                  onPress={() =>
                    setViewMode(viewMode === 'months' ? 'days' : 'months')
                  }>
                  <Text style={styles.titleChipText}>
                    {MONTH_NAMES[activeMonth - 1]} ▼
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.titleChip,
                    viewMode === 'years' && styles.titleChipActive,
                  ]}
                  onPress={() =>
                    setViewMode(viewMode === 'years' ? 'days' : 'years')
                  }>
                  <Text style={styles.titleChipText}>{activeYear} ▼</Text>
                </Pressable>
              </View>

              <Pressable
                style={styles.navBtn}
                hitSlop={10}
                onPress={() => {
                  if (activeMonth < 12) {
                    setActiveMonth(activeMonth + 1);
                  } else {
                    setActiveMonth(1);
                    setActiveYear(activeYear + 1);
                  }
                }}>
                <Text style={styles.navBtnText}>›</Text>
              </Pressable>
            </View>

            {/* VIEW 1: DAYS (7-column Visual Calendar Grid) */}
            {viewMode === 'days' && (
              <View style={styles.daysContainer}>
                {/* Week Day Labels */}
                <View style={styles.weekDaysRow}>
                  {WEEK_DAYS.map((w, idx) => (
                    <View key={w} style={styles.weekDayCol}>
                      <Text
                        style={[
                          styles.weekDayLabel,
                          idx >= 5 && styles.weekDayWeekend,
                        ]}>
                        {w}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* Days Grid */}
                <View style={styles.daysGrid}>
                  {Array.from({ length: firstDayOffset }).map((_, i) => (
                    <View key={`empty-${i}`} style={styles.dayCellWrapper} />
                  ))}

                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const dayNum = i + 1;
                    const isSelected =
                      parsed.year === activeYear &&
                      parsed.month === activeMonth &&
                      parsed.day === dayNum &&
                      Boolean(value);

                    return (
                      <View key={`day-${dayNum}`} style={styles.dayCellWrapper}>
                        <Pressable
                          style={[
                            styles.dayCell,
                            isSelected && styles.dayCellSelected,
                          ]}
                          onPress={() => handleSelectDay(dayNum)}>
                          <Text
                            style={[
                              styles.dayCellText,
                              isSelected && styles.dayCellTextSelected,
                            ]}>
                            {dayNum}
                          </Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* VIEW 2: 12-MONTH PICKER */}
            {viewMode === 'months' && (
              <View style={styles.monthsGrid}>
                {MONTH_NAMES.map((mName, idx) => {
                  const isSelected = activeMonth === idx + 1;
                  return (
                    <Pressable
                      key={mName}
                      style={[
                        styles.monthCell,
                        isSelected && styles.monthCellSelected,
                      ]}
                      onPress={() => handleSelectMonth(idx)}>
                      <Text
                        style={[
                          styles.monthCellText,
                          isSelected && styles.monthCellTextSelected,
                        ]}>
                        {mName}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* VIEW 3: YEAR SELECTOR & DIRECT INPUT */}
            {viewMode === 'years' && (
              <View style={styles.yearsContainer}>
                <View style={styles.yearInputRow}>
                  <TextInput
                    style={styles.yearTextInput}
                    value={yearInput}
                    onChangeText={setYearInput}
                    placeholder="Gõ năm (VD: 2000, 1042)..."
                    placeholderTextColor="#736a5c"
                    keyboardType="numeric"
                  />
                  <Pressable
                    style={styles.yearApplyBtn}
                    onPress={handleApplyYearInput}>
                    <Text style={styles.yearApplyBtnText}>Chọn</Text>
                  </Pressable>
                </View>

                <ScrollView
                  style={styles.yearsScroll}
                  showsVerticalScrollIndicator={true}
                  contentContainerStyle={styles.yearsGrid}>
                  {yearsList.map((y) => {
                    const isSelected = activeYear === y;
                    return (
                      <Pressable
                        key={y}
                        style={[
                          styles.yearCell,
                          isSelected && styles.yearCellSelected,
                        ]}
                        onPress={() => handleSelectYear(y)}>
                        <Text
                          style={[
                            styles.yearCellText,
                            isSelected && styles.yearCellTextSelected,
                          ]}>
                          {y}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Footer Buttons */}
            <View style={styles.calendarFooter}>
              <Pressable style={styles.footerBtn} onPress={handleClear}>
                <Text style={styles.footerClearText}>Xóa</Text>
              </Pressable>

              <View style={styles.footerRight}>
                <Pressable style={styles.footerBtn} onPress={handleSetToday}>
                  <Text style={styles.footerTodayText}>Hôm nay</Text>
                </Pressable>
                <Pressable
                  style={styles.footerDoneBtn}
                  onPress={() => setModalVisible(false)}>
                  <Text style={styles.footerDoneText}>Đóng</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1b1713',
    borderWidth: 1,
    borderColor: '#4a3e30',
    borderRadius: 6,
    paddingHorizontal: 12,
    minHeight: 40,
  },
  dateButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 8,
  },
  calendarIcon: {
    fontSize: 14,
  },
  dateButtonText: {
    color: '#f0e6d6',
    fontSize: 13,
    fontWeight: '500',
  },
  placeholderText: {
    color: '#665f52',
    fontWeight: 'normal',
  },
  clearBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  clearBtnText: {
    color: '#8c7d6b',
    fontSize: 13,
    fontWeight: 'bold',
  },
  chevronIcon: {
    color: '#8c7d6b',
    fontSize: 10,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  calendarCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#1b1713',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4d3f32',
    padding: 14,
    gap: 10,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 16,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#2b231c',
    paddingBottom: 8,
  },
  navBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#26201a',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3d3328',
  },
  navBtnText: {
    color: '#e5a93c',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: -2,
  },
  titlesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  titleChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
    backgroundColor: '#26201a',
    borderWidth: 1,
    borderColor: '#3d3328',
  },
  titleChipActive: {
    borderColor: '#e5a93c',
    backgroundColor: '#e5a93c20',
  },
  titleChipText: {
    color: '#f0e6d6',
    fontSize: 12.5,
    fontWeight: '700',
  },
  daysContainer: {
    gap: 6,
  },
  weekDaysRow: {
    flexDirection: 'row',
    width: '100%',
    marginBottom: 4,
  },
  weekDayCol: {
    width: '14.28%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 3,
  },
  weekDayLabel: {
    textAlign: 'center',
    fontSize: 11,
    color: '#8c7d6b',
    fontWeight: '700',
  },
  weekDayWeekend: {
    color: '#d95a38',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
  },
  dayCellWrapper: {
    width: '14.28%',
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  dayCell: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 6,
    backgroundColor: '#231d17',
    borderWidth: 1,
    borderColor: '#33291f',
  },
  dayCellSelected: {
    backgroundColor: '#e5a93c',
    borderColor: '#e5a93c',
  },
  dayCellText: {
    color: '#e2d7c7',
    fontSize: 13,
    fontWeight: '500',
  },
  dayCellTextSelected: {
    color: '#120f0d',
    fontWeight: 'bold',
  },
  monthsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  monthCell: {
    width: '30%',
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: '#26201a',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#382e23',
  },
  monthCellSelected: {
    backgroundColor: '#e5a93c',
    borderColor: '#e5a93c',
  },
  monthCellText: {
    color: '#e2d7c7',
    fontSize: 12,
    fontWeight: '600',
  },
  monthCellTextSelected: {
    color: '#120f0d',
    fontWeight: 'bold',
  },
  yearsContainer: {
    gap: 8,
  },
  yearInputRow: {
    flexDirection: 'row',
    gap: 6,
  },
  yearTextInput: {
    flex: 1,
    backgroundColor: '#26201a',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#3d3328',
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: '#fff',
    fontSize: 12,
  },
  yearApplyBtn: {
    backgroundColor: '#e5a93c',
    borderRadius: 6,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  yearApplyBtnText: {
    color: '#120f0d',
    fontSize: 12,
    fontWeight: 'bold',
  },
  yearsScroll: {
    maxHeight: 180,
  },
  yearsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'space-between',
  },
  yearCell: {
    width: '30%',
    paddingVertical: 8,
    borderRadius: 5,
    backgroundColor: '#231d17',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#382e23',
  },
  yearCellSelected: {
    backgroundColor: '#e5a93c',
    borderColor: '#e5a93c',
  },
  yearCellText: {
    color: '#e2d7c7',
    fontSize: 12,
  },
  yearCellTextSelected: {
    color: '#120f0d',
    fontWeight: 'bold',
  },
  calendarFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#2b231c',
    paddingTop: 8,
  },
  footerBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  footerClearText: {
    color: '#d95a38',
    fontSize: 12,
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  footerTodayText: {
    color: '#a89885',
    fontSize: 12,
  },
  footerDoneBtn: {
    backgroundColor: '#e5a93c',
    borderRadius: 5,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  footerDoneText: {
    color: '#120f0d',
    fontSize: 12,
    fontWeight: '700',
  },
});
