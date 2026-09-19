from scripts import build_hf_repo


def test_build_lays_out_every_file_the_endpoint_needs(tmp_path):
    build_hf_repo.copy_code(tmp_path)

    assert (tmp_path / "handler.py").exists()
    assert (tmp_path / "requirements.txt").exists()
    assert (tmp_path / "README.md").exists()
    assert (tmp_path / "docai" / "__init__.py").exists()
    assert (tmp_path / "docai" / "pipeline.py").exists()


def test_build_copies_the_pipeline_unchanged():
    source = (build_hf_repo.ROOT / "docai" / "pipeline.py").read_bytes()
    assert build_hf_repo.CODE["docai/pipeline.py"].read_bytes() == source


def test_build_tracks_model_weights_with_lfs(tmp_path):
    build_hf_repo.copy_code(tmp_path)

    attributes = (tmp_path / ".gitattributes").read_text(encoding="utf-8")
    assert "*.pth filter=lfs" in attributes
    assert "*.safetensors filter=lfs" in attributes


def test_build_never_ships_compiled_bytecode(tmp_path):
    stale = tmp_path / "docai" / "__pycache__"
    stale.mkdir(parents=True)
    (stale / "pipeline.cpython-311.pyc").write_bytes(b"stale bytecode")

    build_hf_repo.remove_caches(tmp_path)

    assert not stale.exists()
    assert list(tmp_path.rglob("*.pyc")) == []
