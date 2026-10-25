#!/usr/bin/env python3
"""Collect Stripe sandbox keys privately for the HSP PREPROD setup."""
import getpass
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile


def main():
    root = Path(__file__).resolve().parents[2]
    project = root / "supabase/.temp/project-ref"
    if not project.exists() or project.read_text().strip() != "qaguotdproxamgudnnsd":
        raise ValueError("Le dépôt doit être lié au projet Supabase PREPROD.")
    if not sys.stdin.isatty():
        raise ValueError("Exécute cette commande dans ton terminal interactif.")

    print("Ouvre les clés API de la sandbox Stripe existante.")
    secret = getpass.getpass("Clé secrète de TEST (sk_test_…) : ").strip()
    public = getpass.getpass("Clé publique de TEST (pk_test_…) : ").strip()
    if not re.fullmatch(r"sk_test_[A-Za-z0-9_]+", secret):
        raise ValueError("La clé secrète doit être une clé de test sk_test_.")
    if not re.fullmatch(r"pk_test_[A-Za-z0-9_]+", public):
        raise ValueError("La clé publique doit être une clé de test pk_test_.")

    folder = root / ".tmp/stripe-preprod"
    destination = folder / "credentials.json"
    if subprocess.run(
        ["git", "check-ignore", "--quiet", str(destination)], cwd=root
    ).returncode != 0:
        raise ValueError("Le dossier des clés doit être exclu de Git.")
    folder.mkdir(parents=True, exist_ok=True, mode=0o700)
    folder.chmod(0o700)
    fd, temporary = tempfile.mkstemp(prefix=".credentials-", dir=folder)
    try:
        with os.fdopen(fd, "w") as output:
            json.dump({
                "environment": "test",
                "supabase_project_ref": "qaguotdproxamgudnnsd",
                "STRIPE_SECRET_KEY": secret,
                "STRIPE_PUBLISHABLE_KEY": public,
            }, output)
            output.write("\n")
        os.replace(temporary, destination)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print("Clés de test enregistrées dans le fichier privé .tmp/stripe-preprod/credentials.json.")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, EOFError, KeyboardInterrupt) as error:
        print(str(error) or "Saisie interrompue.", file=sys.stderr)
        sys.exit(1)
