{{/* The existing Secret that holds DATABASE_URL: db.externalSecret.name, else existingSecret, else <fullname>-db. */}}
{{- define "app.dbSecretName" -}}
{{- default (default (printf "%s-db" (include "app.fullname" .)) .Values.existingSecret) .Values.db.externalSecret.name }}
{{- end }}
