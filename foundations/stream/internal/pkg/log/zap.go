// Copyright © 2025-2026 Hardcore Engineering Inc.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.

// Package log provides simple api for using inherited logging
package log

import (
	"context"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

type contextKey struct{}

// WithLevel returns a context carrying a zap.Logger configured at the given
// level (e.g. "debug", "info", "warn", "error"). Unknown levels fall back to
// info. Subsequent WithFields calls on the returned context keep the same
// underlying logger and only add fields.
func WithLevel(ctx context.Context, level string, fields ...zap.Field) context.Context {
	if FromContext(ctx) != nil {
		return WithFields(ctx, fields...)
	}
	var lvl zapcore.Level
	if err := lvl.UnmarshalText([]byte(level)); err != nil {
		lvl = zapcore.InfoLevel
	}
	cfg := zap.NewDevelopmentConfig()
	cfg.Level = zap.NewAtomicLevelAt(lvl)
	logger, err := cfg.Build()
	if err != nil {
		panic(err.Error())
	}
	logger.Info("zap logger was initialized", zap.String("level", lvl.String()))
	go func() {
		<-ctx.Done()
		_ = logger.Sync()
	}()
	return context.WithValue(ctx, contextKey{}, logger.With(fields...))
}

// WithFields createsa new context with zap.Logger and passed fields.
// If no logger is attached yet, a default development logger at info level
// is created. Call WithLevel before WithFields if a different level is needed.
func WithFields(ctx context.Context, fields ...zap.Field) context.Context {
	var logger = FromContext(ctx)
	if logger == nil {
		return WithLevel(ctx, "info", fields...)
	}
	return context.WithValue(ctx, contextKey{}, logger.With(fields...))
}

// FromContext returns zap.Logger from the context
func FromContext(ctx context.Context) *zap.Logger {
	var val = ctx.Value(contextKey{})
	if val == nil {
		return nil
	}
	return val.(*zap.Logger)
}
