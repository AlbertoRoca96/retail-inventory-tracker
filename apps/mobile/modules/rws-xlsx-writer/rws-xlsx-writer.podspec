require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'rws-xlsx-writer'
  s.version        = package['version']
  s.summary        = 'RWS XLSX Writer (libxlsxwriter wrapper)'
  s.description    = 'Streaming XLSX generator for React Native (Expo Modules) using libxlsxwriter.'
  s.license        = { :type => 'MIT' }
  s.authors        = { 'Alberto' => 'alroca308@gmail.com' }
  s.homepage       = 'https://github.com/AlbertoRoca96/retail-inventory-tracker'
  s.platforms      = { :ios => '13.0' }
  s.source         = { :path => '.' }

  s.source_files   = 'ios/**/*.{h,m,mm}'

  s.dependency 'ExpoModulesCore'
  # Pulls C library via CocoaPods (no vendoring yet)
  s.dependency 'libxlsxwriter'
end
