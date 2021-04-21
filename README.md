node-red-contrib-jetson-gpio
============================

A set of <a href="http://nodered.org" target="_new">Node-RED</a> nodes to interact with Jetson Nano GPIO using libgpiod and its utilities.

## Install

Either use the Node-RED Menu - Manage Palette option to install, or run the following
command in your Node-RED user directory - typically `~/.node-red`

        npm i node-red-contrib-jetson-gpio

The sysfs interface for GPIO has been deprecated since kernel 4.8 and Fedora aarch64 is compiled without it. Use libgpiod instead. See: https://fedoraproject.org/wiki/Architectures/ARM/gpio for more information.

	sudo dnf install libgpiod-utils

Or on DEB systems:

	sudo apt install gpiod


## Usage

**Note:** the pin numbers refer the physical pin numbers on connector J41 as they are easier to locate.

### Input node

Generates a `msg.payload` with either a 0 or 1 depending on the state of the input pin.

##### Outputs

 - `msg.payload` - *number* - the level of the pin (0 or 1)
 - `msg.topic` - *string* - jetson/{the pin number}

You may also enable the input pullup resistor &uarr; or the pulldown resistor &darr;.

### Output node

Can be used in Digital or PWM modes.

**Note:** PWM is software based and may cause excessive CPU usage on low power devices.

##### Input

 - `msg.payload` - *number | string*
  - Digital - 0, 1 - set pin low or high. (Can also accept boolean `true/false`)
  - PWM - 0 to 100 - level from 0 to 100%

*Hint*: The `range` node can be used to scale inputs to the correct values.

Digital mode expects a `msg.payload` with either a 0 or 1 (or true or false),
and will set the selected physical pin high or low depending on the value passed in.

The initial value of the pin at deploy time can also be set to 0 or 1.

When using PWM mode, the input value should be a number 0 - 100, and can be floating point.
