export class ImageFixtureBlocked extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ImageFixtureBlocked";
    this.code = code;
    this.status = "BLOCKED";
  }
}

function inspectIdentity(docker, image) {
  const result = docker(["image", "inspect", image]);
  if (result.status !== 0) return null;
  try {
    const inspected = JSON.parse(result.stdout)?.[0];
    if (
      typeof inspected?.Id !== "string" ||
      !inspected.Id.startsWith("sha256:") ||
      typeof inspected?.Created !== "string" ||
      typeof inspected?.Architecture !== "string" ||
      typeof inspected?.Os !== "string"
    ) {
      throw new Error("invalid identity");
    }
    return {
      id: inspected.Id,
      repoDigests: Array.isArray(inspected.RepoDigests) ? [...inspected.RepoDigests] : [],
      created: inspected.Created,
      architecture: inspected.Architecture,
      os: inspected.Os,
      labels: inspected.Config?.Labels ?? {},
    };
  } catch {
    throw new ImageFixtureBlocked(
      "NEO4J_IMAGE_IDENTITY_INVALID",
      `Docker returned an invalid identity for ${image}.`,
    );
  }
}

function verifyVersion(docker, image, expectedVersion) {
  const result = docker([
    "run",
    "--rm",
    "--network",
    "none",
    "--entrypoint",
    "neo4j",
    image,
    "--version",
  ]);
  if (result.status !== 0 || result.stdout.trim() !== expectedVersion) {
    throw new ImageFixtureBlocked(
      "NEO4J_IMAGE_VERSION_MISMATCH",
      `${image} is not exactly Neo4j ${expectedVersion}; it was not accepted or retagged.`,
    );
  }
}

export function prepareExactNeo4jImage(options) {
  const docker = options.docker;
  const exactImage = options.exactImage ?? "neo4j:5.24.2-community";
  const sourceImage = options.sourceImage ?? "neo4j:5.24-community";
  const expectedVersion = options.expectedVersion ?? "5.24.2";
  const exactIdentity = inspectIdentity(docker, exactImage);
  if (exactIdentity) {
    verifyVersion(docker, exactImage, expectedVersion);
    return { createdTag: false, image: exactImage, version: expectedVersion, identity: exactIdentity };
  }

  const sourceIdentity = inspectIdentity(docker, sourceImage);
  if (!sourceIdentity) {
    throw new ImageFixtureBlocked(
      "NEO4J_IMAGE_UNAVAILABLE",
      `Neither ${exactImage} nor the audited local source ${sourceImage} is available.`,
    );
  }
  verifyVersion(docker, sourceImage, expectedVersion);
  const tagged = docker(["tag", sourceImage, exactImage]);
  if (tagged.status !== 0) {
    throw new ImageFixtureBlocked(
      "NEO4J_IMAGE_TAG_FAILED",
      `The verified source image could not be tagged as ${exactImage}.`,
    );
  }
  const taggedIdentity = inspectIdentity(docker, exactImage);
  if (!taggedIdentity || taggedIdentity.id !== sourceIdentity.id) {
    docker(["image", "rm", exactImage]);
    throw new ImageFixtureBlocked(
      "NEO4J_IMAGE_IDENTITY_MISMATCH",
      "The exact image tag did not resolve to the verified source identity.",
    );
  }
  verifyVersion(docker, exactImage, expectedVersion);
  return {
    createdTag: true,
    image: exactImage,
    version: expectedVersion,
    identity: taggedIdentity,
  };
}
