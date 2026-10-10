import { router } from 'expo-router';
import React, { useState } from 'react';
import {
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

import { AppFonts, Spacing, ThemeColors } from '@/constants/theme';

export default function AuthScreen() {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('tam@nguyentam.dev');
  const [password, setPassword] = useState('••••••••••••');

  const handleEnterApp = () => {
    router.push('/projects' as any);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
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

          {/* Tabs */}
          <View style={styles.tabBar}>
            <Pressable
              onPress={() => setTab('login')}
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
              onPress={() => setTab('register')}
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

          {/* Form */}
          <View style={styles.formContainer}>
            <View style={styles.inputWrapper}>
              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                style={styles.textInput}
                value={email}
                onChangeText={setEmail}
                placeholder="Nhập địa chỉ email"
                placeholderTextColor="#5a5449"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputWrapper}>
              <Text style={styles.inputLabel}>Mật khẩu</Text>
              <TextInput
                style={styles.textInput}
                value={password}
                onChangeText={setPassword}
                placeholder="Nhập mật khẩu"
                placeholderTextColor="#5a5449"
                secureTextEntry
              />
            </View>

            {/* Main Action Button */}
            <Pressable
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && styles.primaryBtnPressed,
              ]}
              onPress={handleEnterApp}>
              <Text style={styles.primaryBtnText}>Vào xưởng viết</Text>
            </Pressable>

            {/* Guest Demo Action */}
            <Pressable
              style={styles.guestBtn}
              onPress={handleEnterApp}>
              <Text style={styles.guestBtnText}>
                Xem thử với tài khoản mẫu
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  constellationContainer: {
    position: 'absolute',
    top: 15,
    right: 15,
    opacity: 0.8,
  },
  header: {
    marginBottom: 44,
  },
  topBadge: {
    color: '#bd8f38',
    fontSize: 11,
    letterSpacing: 3,
    fontWeight: '700',
    marginBottom: 18,
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
    marginTop: 18,
    fontSize: 14,
    lineHeight: 22,
    color: ThemeColors.textSecondary,
    fontFamily: AppFonts.sans,
  },
  tabBar: {
    flexDirection: 'row',
    gap: 32,
    marginBottom: 32,
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
  formContainer: {
    gap: 22,
  },
  inputWrapper: {
    borderBottomWidth: 1,
    borderBottomColor: '#29251d',
    paddingBottom: 8,
  },
  inputLabel: {
    fontSize: 13,
    color: '#756d5e',
    marginBottom: 4,
    fontFamily: AppFonts.sans,
  },
  textInput: {
    fontSize: 15,
    color: ThemeColors.textPrimary,
    paddingVertical: 4,
    fontFamily: AppFonts.sans,
  },
  primaryBtn: {
    marginTop: 18,
    backgroundColor: '#db9d33',
    paddingVertical: 15,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#db9d33',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  primaryBtnPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  primaryBtnText: {
    color: '#15130f',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: AppFonts.sans,
    letterSpacing: 0.2,
  },
  guestBtn: {
    marginTop: 14,
    alignItems: 'center',
    paddingVertical: 8,
  },
  guestBtnText: {
    color: '#aa823a',
    fontSize: 13.5,
    fontFamily: AppFonts.sans,
  },
});
