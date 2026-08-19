# Proguard rules for RAFTAR Athletic Intelligence
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.raftar.athletic.** { *; }
