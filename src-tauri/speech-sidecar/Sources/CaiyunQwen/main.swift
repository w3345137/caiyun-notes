import Foundation
import MLXAudioCore
import MLXAudioSTT

struct Transcription: Encodable {
    let text: String
}

let args = CommandLine.arguments
guard args.count == 3 else {
    FileHandle.standardError.write(Data("Expected model directory and WAV path\n".utf8))
    exit(2)
}

do {
    let model = try await Qwen3ASRModel.fromModelDirectory(URL(fileURLWithPath: args[1], isDirectory: true))
    let (_, samples) = try loadAudioArray(from: URL(fileURLWithPath: args[2]), sampleRate: 16_000)
    let output = model.generate(audio: samples, maxTokens: 2_048, chunkDuration: 30)
    let data = try JSONEncoder().encode(Transcription(text: output.text))
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data("\n".utf8))
} catch {
    FileHandle.standardError.write(Data("Local inference failed\n".utf8))
    exit(1)
}
