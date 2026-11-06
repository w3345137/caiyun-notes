// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "CaiyunQwen",
    platforms: [.macOS(.v14)],
    products: [.executable(name: "CaiyunQwen", targets: ["CaiyunQwen"])],
    dependencies: [
        // This release builds with Swift 6.2 and exposes the offline Qwen loader.
        .package(url: "https://github.com/ml-explore/mlx-swift.git", exact: "0.31.4"),
        .package(url: "https://github.com/Neywa-Labs/mlx-audio-swift.git",
                 revision: "8d86630ade569728aaea3dc1a29fc44e2efa719b"),
    ],
    targets: [
        .executableTarget(name: "CaiyunQwen", dependencies: [
            .product(name: "MLXAudioCore", package: "mlx-audio-swift"),
            .product(name: "MLXAudioSTT", package: "mlx-audio-swift"),
        ]),
    ]
)
