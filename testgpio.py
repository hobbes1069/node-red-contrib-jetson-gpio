#!/usr/bin/python
import sys
try:
    import Jetson.GPIO as GPIO
    sys.exit(0)
except ImportError:
    sys.exit(1)
