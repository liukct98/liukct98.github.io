import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import colors from '../utils/colors';
import AlertModal from '../components/AlertModal';

const LoginScreen = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const { login, register } = useAuth();
  const [popup, setPopup] = useState({ visible: false, title: '', message: '', buttons: [] });
  const showPopup = (title, message, buttons) => setPopup({ visible: true, title, message, buttons: buttons || [{ text: 'OK' }] });
  const hidePopup = () => setPopup(p => ({ ...p, visible: false }));

  const handleSubmit = async () => {
    console.log('handleSubmit called', { email, password, isRegister });
    
    if (!email || !password) {
      console.log('Missing email or password');
      showPopup('Errore', 'Inserisci email e password');
      return;
    }

    if (isRegister) {
      if (!username) {
        showPopup('Errore', 'Inserisci un username');
        return;
      }
      console.log('Calling register...');
      const result = await register(email, password, username);
      console.log('Register result:', result);
      if (result.success) {
        showPopup('Successo', result.message);
        setIsRegister(false);
        setUsername('');
      } else {
        showPopup('Errore', result.error);
      }
    } else {
      console.log('Calling login...');
      const result = await login(email, password);
      console.log('Login result:', result);
      if (!result.success) {
        showPopup('Errore', result.error);
      }
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.card}>
        <Text style={styles.title}>💪 My Gym Tracker</Text>
        <Text style={styles.subtitle}>
          {isRegister ? 'Crea un nuovo account' : 'Accedi al tuo account'}
        </Text>

        {isRegister && (
          <TextInput
            style={styles.input}
            placeholder="Username"
            placeholderTextColor={colors.textSecondary}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
          />
        )}

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.textSecondary}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={colors.textSecondary}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity style={styles.button} onPress={handleSubmit}>
          <Text style={styles.buttonText}>
            {isRegister ? 'Registrati' : 'Accedi'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.switchButton}
          onPress={() => setIsRegister(!isRegister)}
        >
          <Text style={styles.switchText}>
            {isRegister
              ? 'Hai già un account? Accedi'
              : 'Non hai un account? Registrati'}
          </Text>
        </TouchableOpacity>
      </View>
      <AlertModal visible={popup.visible} title={popup.title} message={popup.message} buttons={popup.buttons} onDismiss={hidePopup} />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
  },
  input: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  switchButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  switchText: {
    color: colors.primary,
    fontSize: 14,
  },
});

export default LoginScreen;
