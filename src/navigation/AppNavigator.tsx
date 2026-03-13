import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text } from 'react-native';
import BoardScreen from '../screens/BoardScreen';
import TaskDetailScreen from '../screens/TaskDetailScreen';
import SettingsScreen from '../screens/SettingsScreen';

export type RootStackParamList = {
  Main: undefined;
  TaskDetail: { taskId: string | null; initialStatus?: string };
};

type TabParamList = {
  Board: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#0052CC' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: '#0052CC',
        tabBarInactiveTintColor: '#6B778C',
      }}
    >
      <Tab.Screen
        name="Board"
        component={BoardScreen}
        options={{
          title: 'Airtable Kanban',
          tabBarLabel: 'Board',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>⬛</Text>,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>⚙️</Text>,
        }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen
          name="Main"
          component={TabNavigator}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="TaskDetail"
          component={TaskDetailScreen}
          options={{
            headerStyle: { backgroundColor: '#0052CC' },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: '700' },
            headerBackTitle: 'Board',
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
