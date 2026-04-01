import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import colors from '../utils/colors';

/**
 * Cross-platform alert popup that works on web and native.
 *
 * Props:
 *   visible  {boolean}
 *   title    {string}
 *   message  {string}
 *   buttons  {Array<{ text, style?: 'default'|'destructive'|'cancel', onPress? }>}
 *   onDismiss {() => void}  called before any button's onPress
 */
const AlertModal = ({ visible, title, message, buttons, onDismiss }) => {
  const btns = buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }];

  const handlePress = (btn) => {
    onDismiss && onDismiss();
    btn.onPress && btn.onPress();
  };

  return (
    <Modal
      transparent
      animationType="fade"
      visible={!!visible}
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.box}>
          {!!title && <Text style={styles.title}>{title}</Text>}
          {!!message && <Text style={styles.message}>{message}</Text>}
          <View style={[styles.buttons, btns.length === 1 && styles.buttonsSingle]}>
            {btns.map((btn, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  styles.btn,
                  btn.style === 'destructive' && styles.btnDestructive,
                  btn.style === 'cancel' && styles.btnCancel,
                ]}
                onPress={() => handlePress(btn)}
              >
                <Text
                  style={[
                    styles.btnText,
                    btn.style === 'destructive' && styles.btnTextDestructive,
                    btn.style === 'cancel' && styles.btnTextCancel,
                  ]}
                >
                  {btn.text}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  box: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    width: 300,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  message: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  buttons: {
    flexDirection: 'row',
    gap: 10,
  },
  buttonsSingle: {},
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: colors.primary,
  },
  btnDestructive: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  btnCancel: {
    backgroundColor: colors.surfaceLight,
  },
  btnText: {
    color: colors.white,
    fontWeight: '600',
    fontSize: 15,
  },
  btnTextDestructive: {
    color: colors.danger,
  },
  btnTextCancel: {
    color: colors.textSecondary,
  },
});

export default AlertModal;
