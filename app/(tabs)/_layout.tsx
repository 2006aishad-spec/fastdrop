import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticTab } from "@/components/haptic-tab";
import { useColors } from "@/hooks/use-colors";

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 58 + bottomPadding;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#007AFF",
        tabBarInactiveTintColor: colors.muted,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarLabelStyle: { fontSize: 10, fontWeight: "700", marginTop: 1 },
        tabBarStyle: {
          paddingTop: 7,
          paddingBottom: bottomPadding,
          height: tabBarHeight,
          backgroundColor: "#F9F9FB",
          borderTopColor: "#E5E5EA",
          borderTopWidth: 1,
          elevation: 8,
          shadowColor: "#000000",
          shadowOpacity: 0.04,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: -3 },
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Transferir",
          tabBarIcon: ({ color, size }) => <MaterialIcons size={size} name="swap-vert" color={color} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "Histórico",
          tabBarIcon: ({ color, size }) => <MaterialIcons size={size} name="history" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Definições",
          tabBarIcon: ({ color, size }) => <MaterialIcons size={size} name="tune" color={color} />,
        }}
      />
    </Tabs>
  );
}
