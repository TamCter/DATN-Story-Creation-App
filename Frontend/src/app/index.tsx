import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Line } from 'react-native-svg';

import { AppFonts, ThemeColors } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';

type ActiveField = 'penName' | 'email' | 'password' | 'confirmPassword' | null;

export default function AuthScreen() {
  const {
    user,
    isAuthenticated,
    isSubmitting,
    error: authError,
    login,
    register,
    guestLogin,
    logout,
    clearError,
  } = useAuth();

  const [tab, setTab] = useState<'login' | 'register'>('register');
  const [penName, setPenName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Trạng thái bàn phím ảo & Hộp xem trước văn bản trên bàn phím
  const [focusedField, setFocusedField] = useState<ActiveField>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [showPreviewPassword, setShowPreviewPassword] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardVisible(true);
      setKeyboardHeight(e.endCoordinates.height);
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
      setKeyboardHeight(0);
      setFocusedField(null);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Xóa thông báo lỗi khi chuyển tab hoặc đổi input
  const handleTabChange = (newTab: 'login' | 'register') => {
    setTab(newTab);
    setLocalError(null);
    clearError();
    setFocusedField(null);
  };

  const handleFieldChange = (setter: (val: string) => void, val: string) => {
    setter(val);
    if (localError) setLocalError(null);
    if (authError) clearError();
  };

  const activeError = localError || authError;

  // Lấy nhãn và nội dung của ô đang nhập để hiển thị trên hộp xem trước bàn phím
  const getFieldLabel = (field: ActiveField): string => {
    switch (field) {
      case 'penName':
        return 'BÚT DANH TÁC GIẢ';
      case 'email':
        return 'ĐỊA CHỈ EMAIL';
      case 'password':
        return 'MẬT KHẨU';
      case 'confirmPassword':
        return 'NHẬP LẠI MẬT KHẨU';
      default:
        return '';
    }
  };

  const getFieldValue = (field: ActiveField): string => {
    switch (field) {
      case 'penName':
        return penName;
      case 'email':
        return email;
      case 'password':
        return password;
      case 'confirmPassword':
        return confirmPassword;
      default:
        return '';
    }
  };

  const isPasswordField = (field: ActiveField): boolean => {
    return field === 'password' || field === 'confirmPassword';
  };

  // Validate và gửi form
  const handleSubmit = async () => {
    Keyboard.dismiss();
    setLocalError(null);
    clearError();

    const cleanEmail = email.trim();
    const cleanPenName = penName.trim();

    if (tab === 'register') {
      if (!cleanPenName) {
        setLocalError('Vui lòng nhập bút danh của bạn.');
        return;
      }
    }

    if (!cleanEmail) {
      setLocalError('Vui lòng nhập địa chỉ email.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setLocalError('Địa chỉ email không hợp lệ (ví dụ: tacgia@storyapp.vn).');
      return;
    }

    if (!password) {
      setLocalError('Vui lòng nhập mật khẩu.');
      return;
    }

    if (password.length < 6) {
      setLocalError('Mật khẩu phải dài ít nhất 6 ký tự.');
      return;
    }

    if (tab === 'register') {
      if (password !== confirmPassword) {
        setLocalError('Mật khẩu nhập lại không trùng khớp.');
        return;
      }

      const result = await register(cleanPenName, cleanEmail, password);
      if (result.success) {
        router.replace('/projects' as any);
      }
    } else {
      const result = await login(cleanEmail, password);
      if (result.success) {
        router.replace('/projects' as any);
      }
    }
  };

  const handleGuestLogin = async () => {
    Keyboard.dismiss();
    setLocalError(null);
    clearError();
    const result = await guestLogin();
    if (result.success) {
      router.replace('/projects' as any);
    }
  };

  const handleContinueExisting = () => {
    router.replace('/projects' as any);
  };

  const currentVal = getFieldValue(focusedField);
  const isPwd = isPasswordField(focusedField);

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            keyboardVisible && styles.scrollContentWithKeyboard,
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          {/* Top Decorative Constellation */}
          <View style={styles.constellationContainer} pointerEvents="none">
            <Svg height="140" width="160" viewBox="0 0 160 140">
              <Line
                x1="40"
                y1="30"
                x2="110"
                y2="45"
                stroke="rgba(229, 169, 60, 0.25)"
                strokeWidth="1"
              />
              <Line
                x1="110"
                y1="45"
                x2="145"
                y2="20"
                stroke="rgba(229, 169, 60, 0.2)"
                strokeWidth="1"
              />
              <Line
                x1="110"
                y1="45"
                x2="135"
                y2="90"
                stroke="rgba(229, 169, 60, 0.25)"
                strokeWidth="1"
              />
              <Line
                x1="40"
                y1="30"
                x2="70"
                y2="105"
                stroke="rgba(229, 169, 60, 0.2)"
                strokeWidth="1"
              />
              <Line
                x1="70"
                y1="105"
                x2="135"
                y2="90"
                stroke="rgba(229, 169, 60, 0.2)"
                strokeWidth="1"
              />

              <Circle cx="40" cy="30" r="3" fill="#e5a93c" opacity="0.6" />
              <Circle
                cx="110"
                cy="45"
                r="6"
                fill="#e5a93c"
                opacity="0.75"
              />
              <Circle
                cx="110"
                cy="45"
                r="10"
                stroke="#e5a93c"
                strokeWidth="0.8"
                fill="none"
                opacity="0.3"
              />
              <Circle cx="145" cy="20" r="2.5" fill="#e5a93c" opacity="0.5" />
              <Circle cx="135" cy="90" r="3.5" fill="#e5a93c" opacity="0.6" />
              <Circle cx="70" cy="105" r="3" fill="#e5a93c" opacity="0.4" />
            </Svg>
          </View>

          {/* Header Title Section */}
          <View style={styles.header}>
            <Text style={styles.topBadge}>TƠ LÒNG · BẢN THẢO ĐỒ THỊ</Text>
            <Text style={styles.mainTitle}>
              Mỗi câu chuyện{'\n'}
              là một <Text style={styles.highlightWord}>mạng lưới.</Text>
            </Text>
            <Text style={styles.subTitle}>
              Nối nhân vật, sự kiện, phe phái và địa điểm thành một bản đồ sống
              cho thế giới của bạn.
            </Text>
          </View>

          {/* Phiên đăng nhập đang sẵn có */}
          {isAuthenticated && user && (
            <View style={styles.sessionBanner}>
              <View style={styles.sessionInfo}>
                <Text style={styles.sessionBadge}>ĐANG ĐĂNG NHẬP</Text>
                <Text style={styles.sessionName}>
                  {user.penName} <Text style={styles.sessionEmail}>({user.email})</Text>
                </Text>
              </View>
              <View style={styles.sessionActions}>
                <Pressable
                  style={styles.sessionContinueBtn}
                  onPress={handleContinueExisting}>
                  <Text style={styles.sessionContinueText}>Vào xưởng</Text>
                </Pressable>
                <Pressable style={styles.sessionLogoutBtn} onPress={logout}>
                  <Text style={styles.sessionLogoutText}>Đổi tài khoản</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Tabs */}
          <View style={styles.tabBar}>
            <Pressable
              onPress={() => handleTabChange('login')}
              style={[styles.tabItem, tab === 'login' && styles.tabActive]}>
              <Text
                style={[
                  styles.tabText,
                  tab === 'login' && styles.tabTextActive,
                ]}>
                Đăng nhập
              </Text>
              {tab === 'login' && <View style={styles.tabIndicator} />}
            </Pressable>

            <Pressable
              onPress={() => handleTabChange('register')}
              style={[styles.tabItem, tab === 'register' && styles.tabActive]}>
              <Text
                style={[
                  styles.tabText,
                  tab === 'register' && styles.tabTextActive,
                ]}>
                Đăng ký
              </Text>
              {tab === 'register' && <View style={styles.tabIndicator} />}
            </Pressable>
          </View>

          {/* Thông báo lỗi (nếu có) */}
          {!!activeError && (
            <View style={styles.errorAlert}>
              <Svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <Circle cx="12" cy="12" r="10" stroke="#d95a38" strokeWidth="2" />
                <Line x1="12" y1="8" x2="12" y2="12" stroke="#d95a38" strokeWidth="2" strokeLinecap="round" />
                <Circle cx="12" cy="16" r="1.25" fill="#d95a38" />
              </Svg>
              <Text style={styles.errorAlertText}>{activeError}</Text>
            </View>
          )}

          {/* Form */}
          <View style={styles.formContainer}>
            {tab === 'register' ? (
              <>
                <View style={[styles.inputWrapper, focusedField === 'penName' && styles.inputWrapperFocused]}>
                  <TextInput
                    style={styles.textInput}
                    value={penName}
                    onChangeText={(val) => handleFieldChange(setPenName, val)}
                    onFocus={() => setFocusedField('penName')}
                    placeholder="Bút danh (tên hiển thị tác giả)"
                    placeholderTextColor="#685f50"
                    autoCapitalize="words"
                    editable={!isSubmitting}
                  />
                </View>

                <View style={[styles.inputWrapper, focusedField === 'email' && styles.inputWrapperFocused]}>
                  <TextInput
                    style={styles.textInput}
                    value={email}
                    onChangeText={(val) => handleFieldChange(setEmail, val)}
                    onFocus={() => setFocusedField('email')}
                    placeholder="Email của bạn"
                    placeholderTextColor="#685f50"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    editable={!isSubmitting}
                  />
                </View>

                <View style={[styles.inputWrapperWithIcon, focusedField === 'password' && styles.inputWrapperFocused]}>
                  <TextInput
                    style={styles.textInputWithIcon}
                    value={password}
                    onChangeText={(val) => handleFieldChange(setPassword, val)}
                    onFocus={() => setFocusedField('password')}
                    placeholder="Mật khẩu (ít nhất 6 ký tự)"
                    placeholderTextColor="#685f50"
                    secureTextEntry={!showPassword}
                    editable={!isSubmitting}
                  />
                  <Pressable
                    style={styles.eyeBtn}
                    onPress={() => setShowPassword(!showPassword)}>
                    <Text style={styles.eyeBtnText}>
                      {showPassword ? 'Ẩn' : 'Hiện'}
                    </Text>
                  </Pressable>
                </View>

                <View style={[styles.inputWrapperWithIcon, focusedField === 'confirmPassword' && styles.inputWrapperFocused]}>
                  <TextInput
                    style={styles.textInputWithIcon}
                    value={confirmPassword}
                    onChangeText={(val) =>
                      handleFieldChange(setConfirmPassword, val)
                    }
                    onFocus={() => setFocusedField('confirmPassword')}
                    placeholder="Nhập lại mật khẩu"
                    placeholderTextColor="#685f50"
                    secureTextEntry={!showConfirmPassword}
                    editable={!isSubmitting}
                  />
                  <Pressable
                    style={styles.eyeBtn}
                    onPress={() =>
                      setShowConfirmPassword(!showConfirmPassword)
                    }>
                    <Text style={styles.eyeBtnText}>
                      {showConfirmPassword ? 'Ẩn' : 'Hiện'}
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <View style={[styles.inputWrapper, focusedField === 'email' && styles.inputWrapperFocused]}>
                  <TextInput
                    style={styles.textInput}
                    value={email}
                    onChangeText={(val) => handleFieldChange(setEmail, val)}
                    onFocus={() => setFocusedField('email')}
                    placeholder="Email đăng nhập"
                    placeholderTextColor="#685f50"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    editable={!isSubmitting}
                  />
                </View>

                <View style={[styles.inputWrapperWithIcon, focusedField === 'password' && styles.inputWrapperFocused]}>
                  <TextInput
                    style={styles.textInputWithIcon}
                    value={password}
                    onChangeText={(val) => handleFieldChange(setPassword, val)}
                    onFocus={() => setFocusedField('password')}
                    placeholder="Mật khẩu"
                    placeholderTextColor="#685f50"
                    secureTextEntry={!showPassword}
                    editable={!isSubmitting}
                  />
                  <Pressable
                    style={styles.eyeBtn}
                    onPress={() => setShowPassword(!showPassword)}>
                    <Text style={styles.eyeBtnText}>
                      {showPassword ? 'Ẩn' : 'Hiện'}
                    </Text>
                  </Pressable>
                </View>
              </>
            )}

            {/* Main Action Button */}
            <Pressable
              disabled={isSubmitting}
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && !isSubmitting && styles.primaryBtnPressed,
                isSubmitting && styles.primaryBtnDisabled,
              ]}
              onPress={handleSubmit}>
              {isSubmitting ? (
                <View style={styles.btnLoadingRow}>
                  <ActivityIndicator size="small" color="#15130f" />
                  <Text style={styles.primaryBtnText}>
                    {tab === 'register' ? 'Đang tạo tài khoản...' : 'Đang xác thực...'}
                  </Text>
                </View>
              ) : (
                <Text style={styles.primaryBtnText}>
                  {tab === 'register' ? 'Bắt đầu trải nghiệm' : 'Vào xưởng viết'}
                </Text>
              )}
            </Pressable>

            {/* Switch Tab Link */}
            <Pressable
              style={styles.switchTabLink}
              onPress={() => handleTabChange(tab === 'login' ? 'register' : 'login')}>
              <Text style={styles.switchTabText}>
                {tab === 'login' ? (
                  <>
                    Chưa có bút danh?{' '}
                    <Text style={styles.switchTabHighlight}>Đăng ký ngay</Text>
                  </>
                ) : (
                  <>
                    Đã có tài khoản?{' '}
                    <Text style={styles.switchTabHighlight}>Đăng nhập</Text>
                  </>
                )}
              </Text>
            </Pressable>

            {/* Guest Demo Action */}
            <View style={styles.guestSection}>
              <View style={styles.guestDividerRow}>
                <View style={styles.guestLine} />
                <Text style={styles.guestDividerText}>HOẶC</Text>
                <View style={styles.guestLine} />
              </View>

              <Pressable
                disabled={isSubmitting}
                style={({ pressed }) => [
                  styles.guestBtn,
                  pressed && styles.guestBtnPressed,
                ]}
                onPress={handleGuestLogin}>
                <Text style={styles.guestBtnText}>
                  Xem thử với tài khoản mẫu (Lăng Tiêu Khách)
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 🚀 HỘP XEM TRƯỚC VĂN BẢN TRÊN BÀN PHÍM (KEYBOARD ACCESSORY VIEW) */}
      {keyboardVisible && !!focusedField && (
        <View
          style={[
            styles.keyboardAccessoryBar,
            {
              bottom: Platform.OS === 'ios' ? keyboardHeight : 0,
            },
          ]}>
          <View style={styles.accessoryHeaderRow}>
            <View style={styles.accessoryLabelBadge}>
              <Text style={styles.accessoryLabelText}>
                ✍️ {getFieldLabel(focusedField)}
              </Text>
            </View>

            <Pressable
              style={styles.accessoryDismissBtn}
              onPress={() => Keyboard.dismiss()}>
              <Text style={styles.accessoryDismissText}>✕ Thu gọn bàn phím</Text>
            </Pressable>
          </View>

          <View style={styles.accessoryContentRow}>
            <Text
              style={[
                styles.accessoryValueText,
                !currentVal && styles.accessoryValueTextEmpty,
              ]}
              numberOfLines={2}>
              {currentVal
                ? isPwd
                  ? showPreviewPassword
                    ? currentVal
                    : '•'.repeat(Math.min(currentVal.length, 30))
                  : currentVal
                : '(Chưa nhập ký tự nào...)'}
            </Text>

            {isPwd && (
              <Pressable
                style={styles.accessoryToggleBtn}
                onPress={() => setShowPreviewPassword(!showPreviewPassword)}>
                <Text style={styles.accessoryToggleText}>
                  {showPreviewPassword ? 'Ẩn 🙈' : 'Hiện 👁'}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: ThemeColors.background,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 28,
    paddingTop: 36,
    paddingBottom: 40,
    minHeight: '100%',
    justifyContent: 'center',
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  scrollContentWithKeyboard: {
    paddingBottom: 160,
  },
  constellationContainer: {
    position: 'absolute',
    top: 15,
    right: 15,
    opacity: 0.8,
  },
  header: {
    marginBottom: 36,
  },
  topBadge: {
    color: '#bd8f38',
    fontSize: 11,
    letterSpacing: 3,
    fontWeight: '700',
    marginBottom: 16,
    fontFamily: AppFonts.sans,
  },
  mainTitle: {
    fontFamily: AppFonts.serif,
    fontSize: 34,
    lineHeight: 44,
    color: ThemeColors.textPrimary,
    fontWeight: '600',
  },
  highlightWord: {
    color: ThemeColors.gold,
    fontStyle: 'italic',
  },
  subTitle: {
    marginTop: 16,
    fontSize: 14,
    lineHeight: 22,
    color: ThemeColors.textSecondary,
    fontFamily: AppFonts.sans,
  },
  sessionBanner: {
    backgroundColor: '#1b1813',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3a3224',
    padding: 14,
    marginBottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sessionInfo: {
    flex: 1,
  },
  sessionBadge: {
    fontSize: 10,
    letterSpacing: 1.5,
    color: ThemeColors.gold,
    fontWeight: '700',
    marginBottom: 3,
    fontFamily: AppFonts.sans,
  },
  sessionName: {
    color: ThemeColors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: AppFonts.sans,
  },
  sessionEmail: {
    color: ThemeColors.textSecondary,
    fontWeight: '400',
    fontSize: 12,
  },
  sessionActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  sessionContinueBtn: {
    backgroundColor: ThemeColors.gold,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  sessionContinueText: {
    color: '#15130f',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: AppFonts.sans,
  },
  sessionLogoutBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  sessionLogoutText: {
    color: '#9f9484',
    fontSize: 12,
    fontFamily: AppFonts.sans,
  },
  tabBar: {
    flexDirection: 'row',
    gap: 32,
    marginBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#22201a',
  },
  tabItem: {
    paddingBottom: 10,
    position: 'relative',
  },
  tabActive: {},
  tabText: {
    color: '#6e6758',
    fontSize: 15,
    fontWeight: '600',
    fontFamily: AppFonts.sans,
  },
  tabTextActive: {
    color: ThemeColors.textPrimary,
  },
  tabIndicator: {
    position: 'absolute',
    bottom: -1,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: ThemeColors.gold,
  },
  errorAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(217, 90, 56, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(217, 90, 56, 0.35)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 16,
    gap: 10,
  },
  errorAlertText: {
    flex: 1,
    color: '#f09880',
    fontSize: 13,
    lineHeight: 18,
    fontFamily: AppFonts.sans,
  },
  formContainer: {
    gap: 16,
  },
  inputWrapper: {
    borderBottomWidth: 1,
    borderBottomColor: '#28241c',
  },
  inputWrapperWithIcon: {
    borderBottomWidth: 1,
    borderBottomColor: '#28241c',
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputWrapperFocused: {
    borderBottomColor: ThemeColors.gold,
  },
  textInput: {
    fontSize: 15.5,
    color: ThemeColors.textPrimary,
    paddingVertical: 12,
    paddingHorizontal: 0,
    fontFamily: AppFonts.sans,
  },
  textInputWithIcon: {
    flex: 1,
    fontSize: 15.5,
    color: ThemeColors.textPrimary,
    paddingVertical: 12,
    paddingHorizontal: 0,
    fontFamily: AppFonts.sans,
  },
  eyeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  eyeBtnText: {
    color: '#8f887b',
    fontSize: 12.5,
    fontWeight: '600',
    fontFamily: AppFonts.sans,
  },
  primaryBtn: {
    marginTop: 20,
    backgroundColor: '#dca13c',
    paddingVertical: 15,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#dca13c',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  primaryBtnPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  primaryBtnDisabled: {
    opacity: 0.65,
  },
  btnLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  primaryBtnText: {
    color: '#15130f',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: AppFonts.sans,
    letterSpacing: 0.2,
  },
  switchTabLink: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  switchTabText: {
    color: '#8f887b',
    fontSize: 13.5,
    fontFamily: AppFonts.sans,
  },
  switchTabHighlight: {
    color: ThemeColors.gold,
    fontWeight: '600',
  },
  guestSection: {
    marginTop: 10,
    alignItems: 'center',
  },
  guestDividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginVertical: 10,
  },
  guestLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#23201a',
  },
  guestDividerText: {
    marginHorizontal: 14,
    color: '#554d3f',
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: '600',
    fontFamily: AppFonts.sans,
  },
  guestBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  guestBtnPressed: {
    opacity: 0.7,
  },
  guestBtnText: {
    color: '#c29646',
    fontSize: 13.5,
    fontFamily: AppFonts.sans,
    textAlign: 'center',
  },

  // 🌟 Hộp xem trước văn bản trên bàn phím (Keyboard Accessory View)
  keyboardAccessoryBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: '#191612',
    borderTopWidth: 2,
    borderTopColor: ThemeColors.gold,
    paddingHorizontal: 18,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 20,
    zIndex: 99999,
  },
  accessoryHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  accessoryLabelBadge: {
    backgroundColor: 'rgba(229, 169, 60, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(229, 169, 60, 0.3)',
  },
  accessoryLabelText: {
    color: ThemeColors.gold,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    fontFamily: AppFonts.sans,
  },
  accessoryDismissBtn: {
    backgroundColor: '#28241c',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  accessoryDismissText: {
    color: '#c4baa9',
    fontSize: 12,
    fontWeight: '600',
    fontFamily: AppFonts.sans,
  },
  accessoryContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  accessoryValueText: {
    flex: 1,
    color: ThemeColors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: AppFonts.sans,
  },
  accessoryValueTextEmpty: {
    color: '#6e6556',
    fontStyle: 'italic',
    fontSize: 14,
  },
  accessoryToggleBtn: {
    backgroundColor: '#2b261d',
    borderWidth: 1,
    borderColor: 'rgba(229, 169, 60, 0.4)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
  },
  accessoryToggleText: {
    color: ThemeColors.gold,
    fontSize: 12.5,
    fontWeight: '700',
    fontFamily: AppFonts.sans,
  },
});
