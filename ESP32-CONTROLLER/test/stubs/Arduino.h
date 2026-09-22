#pragma once
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>
typedef unsigned char byte;
#define HIGH 1
#define LOW 0
#define OUTPUT 1
#define INPUT_PULLUP 2
class String {
public:
  std::string s;
  String() {}
  String(const char* c) : s(c) {}
  String(const std::string& v) : s(v) {}
  unsigned length() const { return s.size(); }
  void trim() {
    while (!s.empty() && (s.front()==' '||s.front()=='\t')) s.erase(s.begin());
    while (!s.empty() && (s.back()==' '||s.back()=='\t'||s.back()=='\r')) s.pop_back();
  }
  String substring(unsigned i) const { return String(i < s.size() ? s.substr(i) : std::string()); }
  bool startsWith(const char* p) const { return s.rfind(p, 0) == 0; }
  bool operator==(const char* o) const { return s == o; }
  bool operator!=(const char* o) const { return s != o; }
  String& operator+=(char c) { s += c; return *this; }
  friend String operator+(const String& a, const String& b) { return String(a.s + b.s); }
  friend String operator+(const char* a, const String& b) { return String(std::string(a) + b.s); }
};
class SerialClass {
public:
  std::vector<std::string> out;   // lines the board sent up
  std::string pending;            // partial outgoing line
  std::string in;                 // bytes waiting to be read down
  void emit(const std::string& v) { pending += v; }
  void begin(long) {}
  void print(const char* c) { emit(c); }
  void println(const char* c) { emit(c); out.push_back(pending); pending.clear(); }
  void println(const String& v) { emit(v.s); out.push_back(pending); pending.clear(); }
  int available() { return (int)in.size(); }
  int read() { if (in.empty()) return -1; int c = in[0]; in.erase(in.begin()); return c; }
};
extern SerialClass Serial;
unsigned long millis();
void delay(unsigned long);
void pinMode(int, int);
void digitalWrite(int, int);
int digitalRead(int);
class TwoWire {};
extern TwoWire Wire;
